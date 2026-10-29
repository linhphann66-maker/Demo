"""Official Google GenAI SDK adapter. No model-name substitution or mock fallback."""
import base64, json, re
from google import genai
from google.genai import types, errors
from pydantic import BaseModel
try:
    from .gemini_models import Analysis, AnalyzeRequest, PROMPT, validate_analysis
except ImportError:
    from gemini_models import Analysis, AnalyzeRequest, PROMPT, validate_analysis

class AIError(Exception):
    def __init__(self,code,message,status=400):
        self.code,self.message,self.status=code,message,status
        super().__init__(message)

def safe_error(error,key=''):
    if isinstance(error,AIError):return error
    code=getattr(error,'code',None) or getattr(error,'status_code',None)
    message=str(error)
    if re.search(r'location.*not supported|unsupported.*location|region.*not supported',message,re.I):return AIError('region_unavailable','Google không hỗ trợ khu vực của backend hiện tại; công khai site không khắc phục giới hạn này.',400)
    if re.search(r'expired|reported as leaked|key.*revoked',message,re.I):return AIError('key_expired','Google báo key hết hạn, bị thu hồi hoặc bị đánh dấu lộ. Tạo key mới trong Google AI Studio.',401)
    if re.search(r'API_KEY_HTTP_REFERRER_BLOCKED|referrer.*blocked|referer.*blocked|API_KEY_IP_ADDRESS_BLOCKED',message,re.I):return AIError('key_restricted','Key bị giới hạn website/IP. Kiểm tra Application restrictions cho lời gọi từ backend.',403)
    if re.search(r'SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|API.*not enabled',message,re.I):return AIError('api_disabled','Gemini API chưa bật hoặc bị chặn trong project của key.',403)
    if code==402 or 'billing' in str(error).lower():return AIError('billing_required','Google yêu cầu bật billing cho thao tác này.',402)
    if code==400 and any(s in str(error).lower() for s in ('api_key_invalid','api key not valid','invalid api key')):return AIError('invalid_key','API key không hợp lệ.',401)
    if code in (401,403):return AIError('invalid_key','API key không hợp lệ hoặc chưa có quyền truy cập.',401)
    if code==404:return AIError('model_unavailable','Model không khả dụng với API key này. Chọn model khác.',400)
    if code==429:return AIError('quota_exceeded','Hết quota hoặc bị giới hạn tốc độ. Kiểm tra quota/billing trong Google AI Studio.',429)
    if code==400:
        if key:
            try:message=json.loads(message).get('error',{}).get('message',message)
            except ValueError:pass
            from urllib.parse import quote
            message=message.replace(key,'[KEY ĐÃ ẨN]').replace(quote(key,safe=''),'[KEY ĐÃ ẨN]')
            message=re.sub(r'AIza[A-Za-z0-9_-]{10,}|https?://[^\s"<>]+','[ĐÃ ẨN]',message)
            return AIError('provider_request','Google HTTP 400; chi tiết đã lọc: '+message[:320],400)
        return AIError('provider_request','Google từ chối yêu cầu hoặc model không hỗ trợ cấu hình này.',400)
    if isinstance(error,(TimeoutError,ConnectionError)) or type(error).__name__ in ('ConnectError','ReadTimeout','ConnectTimeout'):
        return AIError('network_error','Không kết nối được Google hoặc đã hết thời gian chờ.',502)
    return AIError('server_error','Không xử lý được phản hồi Gemini. Không có thay đổi nào được tự áp dụng.',502)

def image_part(image):
    header,data=image.data.split(',',1)
    return types.Part.from_bytes(data=base64.b64decode(data),mime_type=header[5:].split(';')[0])

class Probe(BaseModel):
    imageSeen: bool

class GeminiProvider:
    def client(self,key):
        return genai.Client(api_key=key,http_options=types.HttpOptions(timeout=65000,retry_options=types.HttpRetryOptions(attempts=1)))
    def models(self,key):
        try:
            with self.client(key) as client:
                return [dict(id=m.name.removeprefix('models/'),displayName=(m.display_name or m.name)[:200],methods=list(m.supported_actions or [])) for m in client.models.list()][:200]
        except Exception as error:
            safe=safe_error(error,key)
            raise AIError(safe.code,'Bước lấy danh sách model: '+safe.message,safe.status) from None
    def probe(self,key,vision_model):
        # This tiny real vision+JSON probe may incur Google API usage; the UI discloses it.
        raw=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC')
        try:
            with self.client(key) as client:
                r=client.models.generate_content(model=vision_model,contents=['Report imageSeen=true only if an image is provided.',types.Part.from_bytes(data=raw,mime_type='image/png')],config=types.GenerateContentConfig(response_mime_type='application/json',response_json_schema=Probe.model_json_schema(),max_output_tokens=512))
                value=Probe.model_validate_json(r.text)
                if not value.imageSeen:raise AIError('capability_unavailable','Model không xác nhận đọc được ảnh.',400)
                return self.usage(r)
        except Exception as error:raise safe_error(error) from None
    def analyze(self,key,model,request:AnalyzeRequest):
        parts=[PROMPT,'Original source images:']
        for image in request.images:parts += [json.dumps({'sourceAssetId':str(image.id),'width':image.width,'height':image.height}),image_part(image)]
        parts += ['Numbered overview; numbers map to the supplied stable candidate IDs.',image_part(request.overview)]
        for i,c in enumerate(request.candidates):
            parts += [json.dumps({'number':i+1,'candidateId':str(c.id),'sourceAssetId':str(c.sourceAssetId),'bbox':c.bbox.model_dump()}),image_part(c.image)]
        try:
            with self.client(key) as client:
                r=client.models.generate_content(model=model,contents=parts,config=types.GenerateContentConfig(response_mime_type='application/json',response_json_schema=Analysis.model_json_schema(),max_output_tokens=8192))
                value=validate_analysis(json.loads(r.text),request)
                return value.model_dump(mode='json'),self.usage(r)
        except Exception as error:raise safe_error(error) from None
    @staticmethod
    def usage(response):
        usage=response.usage_metadata
        return dict(inputTokens=int(getattr(usage,'prompt_token_count',0) or 0),outputTokens=int(getattr(usage,'candidates_token_count',0) or 0))

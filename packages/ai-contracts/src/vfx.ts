import {effectSchema,type VFXEffect} from '../../vfx-core/src/schema';
export interface VFXGenerationRequest {description:string;seed:number;allowedTextureIds:string[];allowedBoneIds:string[];baseRevision:number;}
export interface VFXProvider {id:string;availability():Promise<{ready:boolean;reason?:string}>;createEffectFromDescription(request:VFXGenerationRequest,signal:AbortSignal):Promise<unknown>;suggestEffectParameters(effect:VFXEffect,description:string,signal:AbortSignal):Promise<unknown>;generateParticlePreset(request:VFXGenerationRequest,signal:AbortSignal):Promise<unknown>;generateTrailPreset(request:VFXGenerationRequest,signal:AbortSignal):Promise<unknown>;}
export function validateEffectConfiguration(value:unknown){return effectSchema.safeParse(value);}
export class UnavailableVFXProvider implements VFXProvider{
 id='unconfigured-vfx';async availability(){return {ready:false,reason:'Chưa cấu hình AI VFX provider thật'};}
 async createEffectFromDescription():Promise<never>{throw Error('AI VFX provider unavailable');}
 async suggestEffectParameters():Promise<never>{throw Error('AI VFX provider unavailable');}
 async generateParticlePreset():Promise<never>{throw Error('AI VFX provider unavailable');}
 async generateTrailPreset():Promise<never>{throw Error('AI VFX provider unavailable');}
}

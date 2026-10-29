declare module "site-assets" {
  const assets: Record<string, { body: string; mime: string }>;
  export default assets;
}

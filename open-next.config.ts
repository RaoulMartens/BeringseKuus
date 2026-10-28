// Instellingen van de OpenNext-adapter voor Cloudflare Workers (fase 0 stap E).
//
// Geen incrementele cache (R2): alle pagina's met ledengegevens zijn dynamisch en worden niet bewaard. Komt er
// een pagina die wel tijdelijk bewaard mag worden, dan pas een cache kiezen (docs/hosting.md).
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});

// Het type van de Worker die OpenNext bouwt (.open-next/worker.js), voor worker.ts. Dat bestand bestaat pas na de
// build en heeft geen eigen typen; zonder dit bestand zou worker.ts de typecontrole moeten uitzetten, en dat mag
// niet (Fase-0-plan 1.3).
declare module '*/.open-next/worker.js' {
  const worker: {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  };
  export default worker;
}

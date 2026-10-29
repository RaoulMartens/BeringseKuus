// De taken-Worker (ledenplatform-taken): alleen geplande taken, zonder de Next-app (Bouwbesluiten 3.1, review
// PR12-01). Alleen deze Worker krijgt straks de geheime sleutel van Supabase en de Resend-gegevens. In één Worker met
// de app zou de hele app die sleutel via process.env kunnen lezen, en die sleutel gaat om alle rechten heen.
//
// Nu zonder taken: de proeftaak van fase 0 is weg (Fase-1-plan stap A); de dagmelding komt in fase 7. Er staan geen
// triggers in taken/wrangler.jsonc, dus Cloudflare start hem niet. Hij blijft bestaan, zodat de uitrol en de poort
// (alleen eigen bestanden, geen pakketten) voor fase 7 al werken.
//
// Geen fetch: deze Worker heeft geen adres (workers_dev staat uit in taken/wrangler.jsonc).

const takenWorker = {
  scheduled(): void {
    // Nog geen taken (fase 7).
  },
};

export default takenWorker;

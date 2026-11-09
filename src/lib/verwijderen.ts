// Een concept verwijderen (UC-004 AF-10, wireframes admin-concept-verwijderen en admin-activiteiten-verwijderd): wat de
// bevestigingspagina zegt over wat er meegaat, en de foutcodes in woorden. Alles hier is zuivere logica zonder database.
//
// Een concept kan weg zonder dat iemand het merkt: leden zien het niet (R18). Een gepubliceerde activiteit kan sinds
// 09-11-2026 ook weg, zolang hij nog niet is geweest (wens van de opdrachtgever; annuleren blijft buiten de MVP). Leden zien
// hem dan niet meer, en er gaat nog geen bericht uit: de bevestigingspagina zegt dat, zodat de beheerder het zelf laat weten.

/** Wat de bevestigingspagina van een gepubliceerde activiteit zegt over de afmeldingen; leeg als er geen zijn. */
export function afgemeldTekst(aantal: number): string | null {
  if (aantal === 0) return null;
  return aantal === 1
    ? '1 lid heeft zich afgemeld. Die afmelding verdwijnt ook.'
    : `${aantal} leden hebben zich afgemeld. Die afmeldingen verdwijnen ook.`;
}

/** Wat er met de indeling gebeurt, voor de bevestigingspagina. */
export function ingedeeldTekst(aantal: number): string {
  if (aantal === 0) return 'Er is nog niemand ingedeeld.';
  if (aantal === 1) return '1 persoon is al ingedeeld. Die indeling verdwijnt.';
  return `${aantal} mensen zijn al ingedeeld. Die indeling verdwijnt.`;
}

/**
 * De naam van een verwijderd concept, uit de regel die concept_verwijderen in het wijzigingenlog zet ("<naam> (dd-mm-jjjj)
 * verwijderd als concept"). Het overzicht kan de activiteit zelf niet meer lezen, en de naam hoort niet in de adresbalk.
 * Is de regel niet te lezen, dan is er geen naam.
 */
export function naamUitLog(omschrijving: string): string | null {
  // concept_verwijderen en activiteit_verwijderen bij een concept: "als concept"; bij een gepubliceerde: "na publiceren".
  const gevonden = /^(.+) \(\d{2}-\d{2}-\d{4}\) verwijderd (?:als concept|na publiceren)$/s.exec(
    omschrijving,
  );
  return gevonden?.[1] ?? null;
}

/** De foutcode van het verwijderen als tekst voor de bevestigingspagina. */
export function vertaalVerwijderfout(code: string): string {
  switch (code) {
    case 'alleen_concept':
      return 'Deze activiteit is intussen gepubliceerd en kan niet meer worden verwijderd.';
    case 'activiteit_onbekend':
      return 'Deze activiteit bestaat niet meer.';
    case 'activiteit_niet_open':
      return 'Deze activiteit is al geweest en blijft staan: wie er dienst had, hoort bij de geschiedenis.';
    default:
      return 'Het verwijderen is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';
  }
}

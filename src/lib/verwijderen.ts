// Een concept verwijderen (UC-004 AF-10, wireframes admin-concept-verwijderen en admin-activiteiten-verwijderd): wat de
// bevestigingspagina zegt over wat er meegaat, en de foutcodes in woorden. Alles hier is zuivere logica zonder database.
//
// Alleen een concept kan weg: leden zien het niet en hebben er niets over gehoord (R18), dus er gaat geen bericht uit. Een
// gepubliceerde activiteit verwijderen kan niet; die annuleer je later (buiten de MVP).

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
  const gevonden = /^(.+) \(\d{2}-\d{2}-\d{4}\) verwijderd als concept$/s.exec(omschrijving);
  return gevonden?.[1] ?? null;
}

/** De foutcode van het verwijderen als tekst voor de bevestigingspagina. */
export function vertaalVerwijderfout(code: string): string {
  switch (code) {
    case 'alleen_concept':
      return 'Deze activiteit is intussen gepubliceerd en kan niet meer worden verwijderd.';
    case 'activiteit_onbekend':
      return 'Deze activiteit bestaat niet meer.';
    default:
      return 'Het verwijderen is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';
  }
}

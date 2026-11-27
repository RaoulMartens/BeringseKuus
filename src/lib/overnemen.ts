// Een dienst overnemen (bestuur): de adressen en de foutcodes van dienst_overnemen in woorden. De regels zelf staan in de database
// (migratie 20261127140000); dit is de vertaling naar woorden en de route naar de bevestigingspagina.

/** De bevestigingspagina: de dienst van dit lid bij deze activiteit. */
export function overnemenHref(activiteitId: string, lidId: string): string {
  return `/programma/${activiteitId}/overnemen/${lidId}`;
}

/** De foutcode van de database in woorden voor de beheerder. */
export function vertaalOvernemenfout(code: string, reden?: string): string {
  switch (code) {
    case 'geen_admin':
      return 'Je mag dit niet meer. Log opnieuw in met je code.';
    case 'geen_lid':
      return 'Alleen een bestuurslid dat zelf lid is kan een dienst overnemen. Met een beheeraccount (zonder diensten) kan het niet.';
    case 'zelf':
      return 'Dit is al jouw eigen dienst.';
    case 'geen_bezetter':
      return 'Deze plek is intussen veranderd: het lid staat er niet meer. Kijk naar de actuele indeling.';
    case 'dienst_gewijzigd':
      return 'De dienst van dit lid is intussen anders ingedeeld. Kijk naar de actuele indeling en probeer het opnieuw.';
    case 'rol_niet_overneembaar':
      return 'De eindverantwoordelijke en de bak neem je hier niet over. Wijzig dat in de activiteit zelf.';
    case 'dubbelboeking':
      return 'Je hebt bij deze activiteit al een plek. Je kunt hem niet nog een keer krijgen.';
    case 'zelf_afgemeld':
      return 'Je hebt je voor deze activiteit afgemeld. Trek eerst je afmelding in.';
    case 'activiteit_niet_open':
      return reden === 'afgelopen'
        ? 'Deze activiteit is al geweest. Er valt niets meer over te nemen.'
        : 'Deze activiteit is geannuleerd. Er valt niets over te nemen.';
    default:
      return 'Het is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';
  }
}

/** De melding op het activiteitscherm na het overnemen. */
export function overgenomenMelding(rol: string): { vet: string; vervolg: string } {
  return {
    vet: `Je hebt de dienst als ${rol} overgenomen.`,
    vervolg: 'Het lid dat de dienst had, krijgt hier een mail van. Je staat nu in de rolbezetting.',
  };
}

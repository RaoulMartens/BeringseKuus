/**
 * Een externe helper is eenmalig (de opdrachtgever, 23-11-2026): hij hoort bij de plek waar hij is ingevuld en staat daarna niet meer in
 * de keuzelijst van andere activiteiten. Een lid staat er altijd in; een externe helper alleen als hij op deze activiteit al
 * een plek heeft, zodat zijn naam zichtbaar blijft en hij van die plek gehaald kan worden.
 */
export function staatInKeuzelijst(
  lid: { id: string; type: string },
  bezettersDezeActiviteit: ReadonlySet<string | null>,
): boolean {
  return lid.type !== 'extern' || bezettersDezeActiviteit.has(lid.id);
}

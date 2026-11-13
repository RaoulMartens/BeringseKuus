// "Je bent" op Mijn account: de groepen waar je in zit (Raad van Elf, Dames, …) en of je beheerder bent. Iedereen is lid, dus "lid" staat er
// alleen als je in geen enkele groep zit. De groepen bepalen welke activiteiten je ziet (R22). Beheerder is geen bestuurslid: het bestuur
// is zelf een groep.

/**
 * "Lid", "Raad van Elf", "Raad van Elf en Dames", "Raad van Elf en beheerder", "Lid en beheerder". Een account dat er alleen is om te
 * beheren (alleenBeheer) is geen lid en heet gewoon "Beheerder"; zonder beheerrechten is de vlag zonder betekenis.
 */
export function jeBent(groepen: string[], isBeheerder: boolean, alleenBeheer = false): string {
  if (isBeheerder && alleenBeheer) return 'Beheerder';
  const namen = groepen.map((groep) => groep.trim()).filter((groep) => groep !== '');
  const delen = [...(namen.length > 0 ? namen : ['Lid']), ...(isBeheerder ? ['beheerder'] : [])];
  if (delen.length === 1) return delen[0] ?? 'Lid';
  return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1] ?? ''}`;
}

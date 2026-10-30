import type { Metadata } from 'next';
import Link from 'next/link';

import { Bovenbalk } from '@/components/bovenbalk/bovenbalk';
import { Icoon, type IcoonNaam } from '@/components/icoon/icoon';
import { ICOON_DATA } from '@/components/icoon/data';
import { Kaart } from '@/components/kaart/kaart';
import { Knop, type KnopSoort } from '@/components/knop/knop';
import { Kopvlak } from '@/components/kopvlak/kopvlak';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding, type MeldingSoort } from '@/components/melding/melding';
import { Statuslabel, type Status } from '@/components/statuslabel/statuslabel';
import { Veld } from '@/components/veld/veld';

import stijl from './ontwerp.module.css';

export const metadata: Metadata = {
  title: 'Ontwerp: onderdelen – Ledenplatform',
  description:
    'Alle onderdelen van het ontwerp in al hun toestanden, om naast het visuele ontwerp te leggen.',
  robots: { index: false, follow: false },
};

const THEMAS = ['beringse', 'blauw', 'roze', 'geel', 'paars'] as const;
type Thema = (typeof THEMAS)[number];

const KNOPPEN: { soort: KnopSoort; tekst: string; icoon?: IcoonNaam; gewicht?: 'bold' }[] = [
  { soort: 'primair', tekst: 'Hoofdactie' },
  { soort: 'positief', tekst: 'Activiteit aanmaken', icoon: 'plus', gewicht: 'bold' },
  { soort: 'negatief', tekst: 'Afmelden' },
  { soort: 'secundair', tekst: 'Meerdere tegelijk aanmaken', icoon: 'kalender-herhalen' },
  { soort: 'gevaar', tekst: 'Verwijderen', icoon: 'prullenbak' },
  { soort: 'tekst', tekst: 'Annuleren' },
  { soort: 'tekst-gevaar', tekst: 'Concept verwijderen' },
];

const MELDINGEN: { soort: MeldingSoort; tekst: string }[] = [
  { soort: 'info', tekst: 'Iedereen staat standaard op aanwezig. Alleen afmeldingen worden opgeslagen.' },
  { soort: 'let-op', tekst: 'Er staan nog wijzigingen die niet zijn opgeslagen.' },
  { soort: 'fout', tekst: 'Deze plek is net door iemand anders gewijzigd. Dit is de actuele stand.' },
  { soort: 'succes', tekst: 'De activiteit is gepubliceerd.' },
  { soort: 'afgemeld', tekst: 'Je bent afgemeld voor deze activiteit.' },
];

const STATUSSEN: { status: Status; tekst: string }[] = [
  { status: 'concept', tekst: 'Concept' },
  { status: 'gepubliceerd', tekst: 'Gepubliceerd' },
  { status: 'geannuleerd', tekst: 'Geannuleerd' },
  { status: 'neutraal', tekst: 'Neutraal' },
];

const ICONEN = Object.keys(ICOON_DATA) as IcoonNaam[];

export default async function Ontwerp({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { thema: gevraagd } = await searchParams;
  const thema: Thema = THEMAS.find((naam) => naam === gevraagd) ?? 'beringse';

  return (
    <main className={stijl.pagina} data-thema={thema === 'beringse' ? undefined : thema}>
      <h1 className={stijl.paginaTitel}>Ontwerp: onderdelen</h1>
      <p>
        Alle onderdelen in hun toestanden, om naast <code>docs/visueel</code> te leggen. Kies een thema:{' '}
        {THEMAS.map((naam) => (
          <Link
            key={naam}
            href={naam === 'beringse' ? '/ontwerp' : `/ontwerp?thema=${naam}`}
            className={stijl.themakeuze}
          >
            {naam}
          </Link>
        ))}
      </p>

      <section className={stijl.blok} aria-labelledby="o-knoppen">
        <h2 id="o-knoppen">Knoppen</h2>
        <div className={stijl.rij}>
          {KNOPPEN.map((knop) => (
            <Knop key={knop.soort} soort={knop.soort} icoon={knop.icoon} icoonGewicht={knop.gewicht}>
              {knop.tekst}
            </Knop>
          ))}
        </div>
        <h3>Uitgeschakeld, als link en over de volle breedte</h3>
        <div className={stijl.rij}>
          <Knop disabled>Publiceren</Knop>
          <Knop soort="secundair" disabled>
            Opslaan als concept
          </Knop>
          <Knop href="/ontwerp" soort="primair" icoon="pijl-rechts">
            Een link die eruitziet als een knop
          </Knop>
        </div>
        <div className={stijl.smal}>
          <Knop vol soort="positief">
            Publiceren
          </Knop>
        </div>
      </section>

      <section className={stijl.blok} aria-labelledby="o-velden">
        <h2 id="o-velden">Velden</h2>
        <div className={stijl.velden}>
          <Veld id="o-naam" label="Naam van de activiteit" defaultValue="Bonte Avond" />
          <Veld
            id="o-code"
            label="Code uit de app"
            hulp="6 cijfers"
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <Veld
            id="o-fout"
            label="E-mailadres"
            type="email"
            defaultValue="geen-adres"
            fout="Vul een geldig e-mailadres in."
          />
          <Veld
            id="o-gewijzigd"
            label="Locatie"
            defaultValue="De Wieksjlaag"
            gewijzigd
            hulp="Nog niet opgeslagen"
          />
          <Veld id="o-uit" label="Eindtijd" disabled defaultValue="23:00" />
        </div>
      </section>

      <section className={stijl.blok} aria-labelledby="o-meldingen">
        <h2 id="o-meldingen">Meldingen en labels</h2>
        <div className={stijl.stapel}>
          {MELDINGEN.map((melding) => (
            <Melding key={melding.soort} soort={melding.soort}>
              {melding.tekst}
            </Melding>
          ))}
        </div>
        <div className={stijl.rij}>
          {STATUSSEN.map((label) => (
            <Statuslabel key={label.status} status={label.status}>
              {label.tekst}
            </Statuslabel>
          ))}
        </div>
      </section>

      <section className={stijl.blok} aria-labelledby="o-kaarten">
        <h2 id="o-kaarten">Kaarten en lijsten</h2>
        <div className={stijl.kolommen}>
          <Kaart titel="Jouw status" kop="h3" ondertitel="Je staat op aanwezig.">
            <p>Een gewone kaart met tekst en een knop.</p>
            <div className={stijl.afstand}>
              <Knop soort="negatief">Afmelden</Knop>
            </div>
          </Kaart>
          <Kaart titel="Programma" kop="h3" lijst>
            <Lijst>
              <Lijstrij href="/ontwerp">
                <strong>Bonte Avond</strong> <Statuslabel status="gepubliceerd">Gepubliceerd</Statuslabel>
              </Lijstrij>
              <Lijstrij href="/ontwerp" gemarkeerd>
                <strong>Verlovingsbal</strong> Je bent afgemeld
              </Lijstrij>
              <Lijstrij href="/ontwerp">
                <strong>Optocht</strong> <Statuslabel status="concept">Concept</Statuslabel>
              </Lijstrij>
              <Lijstrij uitgeschakeld>Opruimen, afgelopen</Lijstrij>
            </Lijst>
          </Kaart>
        </div>
      </section>

      <section className={stijl.blok} aria-labelledby="o-balk">
        <h2 id="o-balk">Bovenbalk en kopvlak</h2>
        <div className={stijl.kader}>
          <Bovenbalk
            merk="De Beringse Kuus"
            onderdelen={[
              { href: '/ontwerp', label: 'Start', stip: 1, actief: true },
              { href: '/ontwerp', label: 'Programma', stip: 2 },
              { href: '/ontwerp', label: 'Beheer', stip: 3 },
            ]}
            gebruiker={{ voornaam: 'Sam', href: '/ontwerp' }}
          />
          <Kopvlak titel="Programma">
            <Link href="/ontwerp">Terug</Link>
          </Kopvlak>
          <Kopvlak titel="Alaaf, Sam" datum="Vrijdag 22 januari" groot />
        </div>
      </section>

      <section className={stijl.blok} aria-labelledby="o-iconen">
        <h2 id="o-iconen">Iconen</h2>
        <ul className={stijl.iconen}>
          {ICONEN.map((naam) => (
            <li key={naam}>
              <Icoon naam={naam} />
              <span>{naam}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

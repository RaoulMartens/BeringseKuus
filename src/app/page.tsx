import Link from 'next/link';

export default function Startpagina() {
  return (
    <>
      <header>
        <nav aria-label="Hoofdmenu">
          <Link href="/">Ledenplatform</Link>
        </nav>
      </header>
      <main>
        <h1>Ledenplatform</h1>
        <p>Dit platform is in aanbouw.</p>
      </main>
    </>
  );
}

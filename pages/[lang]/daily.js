import Home from '@/components/home';

const SUPPORTED = ['es', 'fr', 'de', 'ru', 'en'];

export async function getStaticPaths() {
  return {
    paths: SUPPORTED.map(lang => ({ params: { lang } })),
    fallback: false,
  };
}

export async function getStaticProps() {
  return { props: {} };
}

export default function LocalizedDailyPage() {
  return <Home initialScreen="daily" />;
}

// Minimal next/router stand-in for the standalone embed bundle. useTranslation
// only reads router.asPath (to detect a /xx language prefix); the embed instead
// drives language via localStorage + a 'langChange' event, so an empty path is
// correct here.
const noopRouter = {
  asPath: '/',
  pathname: '/',
  route: '/',
  query: {},
  isReady: true,
  push() {
    return Promise.resolve(true);
  },
  replace() {
    return Promise.resolve(true);
  },
  prefetch() {
    return Promise.resolve();
  },
  back() {},
  events: { on() {}, off() {}, emit() {} },
};

export function useRouter() {
  return noopRouter;
}

export default { useRouter };

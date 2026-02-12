const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// For static assets: asset('/icon.ico') → '/subpath/icon.ico'
export function asset(path) {
  return basePath + path;
}

// For window.location navigation: navigate('/banned') → '/subpath/banned'
export function navigate(path) {
  return basePath + path;
}

// Strip basePath from pathname for comparisons
// stripBase('/subpath/map/foo') → '/map/foo'
export function stripBase(pathname) {
  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}

export { basePath };

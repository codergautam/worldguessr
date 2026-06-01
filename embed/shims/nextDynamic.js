import React from 'react';

// Minimal stand-in for next/dynamic used when bundling the web map into a
// standalone (non-Next) HTML for the mobile WebView. react-leaflet is bundled,
// so we just resolve the loader on mount and render the resulting component.
export default function dynamic(loader) {
  return function Dynamic(props) {
    const [Comp, setComp] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      Promise.resolve(loader())
        .then((mod) => {
          if (alive) setComp(() => (mod && mod.default ? mod.default : mod));
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []);
    return Comp ? React.createElement(Comp, props) : null;
  };
}

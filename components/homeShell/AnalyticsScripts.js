import Script from "next/script";

export default function AnalyticsScripts() {
  return (
    <Script id="clarity">
      {`

document.addEventListener(
  'wheel',
  function touchHandler(e) {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  },
  { passive: false }
);
            window.gameOpen = Date.now();

            setTimeout(() => {
            if(window.PokiSDK) {
            console.log("Poki SDK found initialized")
            window.PokiSDK.init().then(() => {
    console.log("Poki SDK successfully initialized");
    window.poki = true;
    // fire your function to continue to game
    window.PokiSDK.gameLoadingFinished();

}).catch(() => {
    console.log("Initialized, something went wrong, load you game anyway");
    // fire your function to continue to game
});
            }
}, 1000);


  	window.aiptag = window.aiptag || {cmd: []};
	aiptag.cmd.display = aiptag.cmd.display || [];

	//CMP tool settings
	aiptag.cmp = {
		show: true,
		position: "centered",  //centered, bottom
		button: true,
		buttonText: "Privacy settings",
		buttonPosition: "bottom-left" //bottom-left, bottom-right, bottom-center, top-left, top-right
	}
   window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = adConfig = function(o) {adsbygoogle.push(o);}
   adConfig({preloadAdBreaks: 'on'});

  `}
    </Script>
  );
}

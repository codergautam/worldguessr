import { Html, Head, Main, NextScript } from "next/document";
import React, { useEffect } from "react";

export default function Document() {
  return (
    <Html lang="en" style={{ backgroundColor: '#000000' }}>
      <Head>
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body {
              background-color: #000000 !important;
              margin: 0;
              padding: 0;
            }
          `
        }} />
      </Head>
      <body className="mainBody" style={{ backgroundColor: '#000000' }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

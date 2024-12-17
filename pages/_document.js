import { Html, Head, Main, NextScript } from "next/document";
import React, { useEffect } from "react";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <script src="https://cdn.lordicon.com/lordicon.js"></script>
      <body className="mainBody">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

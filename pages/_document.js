import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body style={{overflow: 'hidden', userSelect:"none"  }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

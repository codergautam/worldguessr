export default function fixBranding() {
  try{
  document.querySelector("a[rel=noopener]")?.remove()
  }catch(e){}
}
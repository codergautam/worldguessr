export default function Navbar({ shown, backBtnPressed }) {
  return (
    <>
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"}`}>
      <h1 className="navbar__title">WorldGuessr</h1>
      <button className="gameBtn backBtn" onClick={backBtnPressed}>Back</button>
    </div>
)}
    </>
  )
}
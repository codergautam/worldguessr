export default function GameBtn(props) {
  return (
    <button
      className={`gameBtn`}
      {...props}
    >
      {props.text}
    </button>
  );
}
import { Modal } from "react-responsive-modal";
import { useState } from "react";
import { useTranslation } from 'next-i18next';
import { toast } from "react-toastify";

export default function ExplanationModal({ lat, long, session, shown, onClose }) {
  const { t: text } = useTranslation("common");

  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!explanation) {
      setError("Explanation is required");
      return;
    }

    try {
      // send as form data
      // form data object
      const formData = new FormData();
      formData.append('lat', lat);
      formData.append('lng', long);
      formData.append('secret', session?.token?.secret);
      formData.append('clueText', explanation);
      setSending(true);


      const response = await fetch('/api/clues/makeClue', {
        method: 'POST',
        headers: {
          // 'Content-Type': 'application/json',
        },
        // body: JSON.stringify({
        //   lat,
        //   lng,
        //   secret: session?.token?.secret,
        //   clueText: explanation,
        // }),
        body: formData,

      });

      if (response.ok) {
      setSending(false);

        toast.success('Explanation submitted successfully!');
        setExplanation('');
        onClose();
      } else {
        const data = await response.json();
      setSending(false);

        setError(data.message || 'An error occurred');
      }
    } catch (err) {
      setSending(false);

      setError('An error occurred while submitting the explanation');
    }
  };

  return (
    <Modal
      id="explanationModal"
      styles={{
        modal: {
          zIndex: 100,
          background: '#333',
          color: 'white',
          padding: '20px',
          borderRadius: '10px',
          fontFamily: "'Arial', sans-serif",
          maxWidth: '500px',
          textAlign: 'center',
        }
      }}
      open={shown}
      center
      onClose={onClose}
    >
      <h2>Write an explanation</h2>
      <p>Explain the reasoning behind your guess (in English)</p>
      <p>Be specific and explain specific details in the streetview that helped you pinpoint the country and region</p>
      <p style={{color: explanation.length < 100 ? "red" : "green"}}>({explanation.length} / 1000)</p>

      <textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder={"Enter Explanation"}
        maxLength={1000}
        style={{
          width: '100%',
          height: '150px',
          padding: '10px',
          borderRadius: '5px',
          border: '1px solid #ccc',
          marginBottom: '20px',
          fontSize: '16px',
          fontFamily: "'Arial', sans-serif",
          resize: 'none',
          background: '#444', // dark mode: #444
          color: 'white',
        }}
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={sending}
        style={{
          background: sending ? 'gray' : 'green',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '5px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '20px',
        }}
      >
        {sending ? text("loading") : "Submit Explanation"}
      </button>
    </Modal>
  );
}

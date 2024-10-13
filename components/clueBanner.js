import { useTranslation } from '@/components/useTranslations'
import msToTime from './msToTime';
import { useState, useEffect } from 'react';
import { Rating } from '@smastrom/react-rating';
import { toast } from 'react-toastify';
import { ThinStar } from '@smastrom/react-rating';
import Link from 'next/link';

export default function ClueBanner({ explanations, close, session }) {
  const { t: text } = useTranslation("common");
  const [index, setIndex] = useState(0);
  const [ratedIndexes, setRatedIndexes] = useState({});

  useEffect(() => {
    setRatedIndexes({});
  }, [explanations]);
// explanations: [
// {id, cluetext, rating, ratingcount, created_by_name, created_at} ]


const explanation = explanations[index];
if(!explanation) return null;
const humanTime = msToTime(explanation.created_at);
const readOnly = (!session?.token?.secret || ratedIndexes[`rate${index}`])?true:false
const value = ratedIndexes[`rate${index}`] ? ratedIndexes[`rate${index}`] : explanation.rating;
  return (
    <div id='endBanner' className='clueBanner'>
      <div className="explanationContainer"
style={{overflowY: 'scroll', maxHeight: '40vh'}}
>
  <div className="bannerContent">
    <span className='smallmainBannerTxt'>
      {/* Your guess was {km} km away! */}
      Explanations (beta)
      </span>


      {explanation.cluetext.split("\n").map((line, i) => (
  <p className='motivation' style={{fontSize: '0.6em', marginBottom: '15px'}} key={i}>
    {line.split(" ").map((word, j) => (
      word.startsWith("http") || word.startsWith("www.") || word.startsWith("plonkit.net") ? (
        <button key={j} className="linkButton" onClick={() => window.open(word.startsWith("http") ? word : `https://${word}`, '_blank')}>{word}</button>
      ) : (
        word + " "
      )
    ))}
  </p>
))}

  </div>

  <div className="explanationFooter">

<div style={{display: 'flex', justifyContent: 'center'}}>

<span className="createdBy" style={{fontWeight: 10}}>{text("explanationFooter", {
      name: explanation.created_by_name,
      time: humanTime
    })}</span>
    &nbsp;&nbsp;
| &nbsp;
<Rating
style={{ maxWidth: 100 }}
halfFillMode='svg'

  value={readOnly?value:Math.round(value)}
  // value={4.5}
  readOnly={readOnly}
  onChange={(value) => {
    // send rating to server
    if(ratedIndexes[`rate${index}`]) return;
    setRatedIndexes({
      ...ratedIndexes,
      [`rate${index}`]: value
    });
    fetch(window.cConfig.apiUrl+'/api/clues/rateClue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clueId: explanation.id,
        rating: value,
        secret: session?.token?.secret,
      }),
    }).then((res) => {
      if (res.ok) {
        toast.success('Rating submitted successfully!');
      } else {
        setRatedIndexes({
          ...ratedIndexes,
          [`rate${index}`]: undefined
        });
      }
    }).catch(() => {
      setRatedIndexes({
        ...ratedIndexes,
        [`rate${index}`]: undefined
      });
    });
  }}

  />
  ({explanation.ratingcount + (ratedIndexes[`rate${index}`] ? 1 : 0)})
  </div>
    </div>

  <div class="endButtonContainer">

  <button className="openInMaps" onClick={close}>
  {text("close")}
</button>
  </div>

  </div>

</div>
  )
}
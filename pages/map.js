import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '@/styles/MapPage.module.css'; // Import CSS module for styling
import Navbar from '@/components/ui/navbar';
import { useTranslation } from '@/components/useTranslations'
import config from '@/clientConfig';
import { getHeaders } from '@/components/auth/auth';
import { toast } from 'react-toastify';


// export async function getServerSideProps(context) {
//   const { slug } = context.params;
//   const locale = context.locale;

//   const cntryMap = Object.values(officialCountryMaps).find(map => map.slug === slug);
//   if(cntryMap) {
//     return {
//       props: {
//         mapData: {...JSON.parse(JSON.stringify(cntryMap)),
//           description_short: cntryMap.shortDescription,
//           description_long: cntryMap.longDescription,
//           created_by: "WorldGuessr",
//           in_review: false,
//           rejected: false
//         }
//       }
//     };
//   }

//   const session = await getSession(context);
//   const staff = session?.token?.staff;

//   const map = await Map.findOne({ slug })
//   .select({ 'data': { $slice: 10 } })
//   .lean();

//   if (!map) {
//     // 404
//     return {
//       notFound: true,
//     };
//   }

//   const authorId = map.created_by;
//   const authorUser = await User.findById(authorId).lean();
//   const authorSecret = authorUser?.secret;


//   const isCreatorOrStaff = session && (authorSecret === session?.token?.secret || staff);

//   if (!map.accepted && !isCreatorOrStaff) {
//     return {
//       notFound: true,
//     };
//   }

//   map.created_by = authorUser?.username;
//   map.created_at = msToTime(Date.now() - map.created_at);

//   return {
//     props: {
//       mapData: JSON.parse(JSON.stringify(map))
//     }
//   };
// }

export default function MapPage({ }) {
  const router = useRouter();
  const [currentLocationIndex, setCurrentLocationIndex] = useState(0);
  const [locationUrls, setLocationUrls] = useState([]);
  const [fadeClass, setFadeClass] = useState(styles.iframe);
  const { t: text } = useTranslation('common');
  const [mapData, setMapData] = useState({});

  // const mapData = {
  //   name: "United States",
  //   description_short: "Explore the United States of America",
  //   description_long: "Explore the United States of America on WorldGuessr, a free GeoGuessr clone. This map features locations from all 50 states, including landmarks, cities, and natural wonders.",
  //   created_by: "WorldGuessr",
  //   created_at: "1 year",
  //   in_review: false,
  //   rejected: false,
  //   countryCode: "US",
  // };

  useEffect(() => {
    const {apiUrl} = config()
    // slug can either be in two forms
    // /map/:slug (path param)
    // /map?s=slug (query param)

    const queryParams = new URLSearchParams(window.location.search);
    const slug = router.query.s || router.query.slug || queryParams.get('s') || queryParams.get('slug');

    if (!slug) return;

    console.log('fetching map data for', slug, getHeaders());
    fetch(apiUrl+`/api/map/publicData?slug=${slug}`,{
      headers: {
        authorization: getHeaders()?.authorization
      }
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        console.log('fetched map data:', data);
        setMapData(data.mapData);
      } else {
        console.error('Failed to fetch map data:', res);
        if(res.status === 404) {
          router.push('/404');
        }
      }
    }).catch(err => {
      alert('An error occurred while fetching map data');
      // router.push('/404');
    });
  }, []);


  useEffect(() => {
    if (!mapData.data) return;

    const urls = mapData.data.map(location =>
      `//www.google.com/maps/embed/v1/streetview?key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&location=${location.lat},${location.lng}&fov=60`
    );
    setLocationUrls(urls);

    const intervalId = setInterval(() => {
      setFadeClass(styles.iframe + ' ' + styles.fadeOut);
      setTimeout(() => {
        setCurrentLocationIndex(Math.floor(Math.random() * urls.length));
        setFadeClass(styles.iframe + ' ' + styles.fadeIn);
      }, 1000);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [mapData.data]);

  const handlePlayButtonClick = () => {
    window.location.href = `/?map=${mapData.countryCode || mapData.slug}${window.location.search.includes('crazygames') ? '&crazygames=true' : ''}`;
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>{
          mapData?.name ? `${mapData.name} - WorldGuessr` :
        "Play this Custom Map on WorldGuessr"
        }</title>
        <meta name="description" content={`Explore the world on WorldGuessr, a free GeoGuessr clone. `} />
    <link rel="icon" type="image/x-icon" href="/icon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

      </Head>
      <style>
        {`
          .mainBody {
            user-select: auto !important;
            overflow: auto !important;
          }
        `}
      </style>
      <main className={styles.main}>
        <Navbar />

          {mapData?.name && (
            <>

        {mapData.in_review && (
          <div className={styles.statusMessage}>
            <p>⏳ This map is currently under review.</p>
          </div>
        )}

        {mapData.reject_reason && (
          <div className={styles.statusMessage}>
            <p>❌ This map has been rejected: {mapData.reject_reason}</p>
          </div>
        )}

</>
          )}

        <div className={styles.branding}>
          <h1>WorldGuessr</h1>
          <center>
            <button onClick={() => window.location.href=`/${
              window.location.search.includes('crazygames') ? '?crazygames=true' : ''
            }`} className={styles.backButton}>
              ← {text('backToGame')}
            </button>
          </center>
        </div>

        {!mapData.name && (
          <div className={styles.statusMessage} style={{backgroundColor: 'green', color: 'white'}}>
            <center>
            <p>Loading map...</p>
            </center>
          </div>
        )}


          { mapData.name && (
        <div className={styles.mapHeader}>
          <div className={styles.mapImage}>
            {locationUrls.length > 0 && (
              <div className={styles.iframeContainer}>
                <iframe
                  className={fadeClass}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={locationUrls[currentLocationIndex]}
                ></iframe>
              </div>
            )}

            {mapData.countryCode && (
              <img src={`https://flagcdn.com/w2560/${mapData.countryCode?.toLowerCase()}.png`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
          <div className={styles.mapInfo}>
            <h1>{mapData.name}</h1>
            <p>{mapData.description_short}</p>
          </div>
        </div>
          )}

{ mapData?.name && (
  <>
        <button className={styles.playButton} onClick={handlePlayButtonClick}>
          PLAY
        </button>
        <div className={styles.mapStats}>
          {typeof mapData.plays !== "undefined" && (
            <div className={styles.stat}>
              <span className={styles.statIcon}>👥</span>
              <span className={styles.statValue}>{mapData.plays.toLocaleString()}</span>
              <span className={styles.statLabel}>Plays</span>
            </div>
          )}

          {/* <div className={styles.stat}>
            <span className={styles.statIcon}>📍</span>
            <span className={styles.statValue}>{mapData.data ? formatNumber(mapData.data.length, 3) : <FaInfinity />}</span>
            <span className={styles.statLabel}>Locations</span>
          </div> */}
          {typeof mapData.hearts !== "undefined" && (
            <div className={styles.stat}>
              <span className={styles.statIcon}>❤️</span>
              <span className={styles.statValue}>{mapData.hearts.toLocaleString()}</span>
              <span className={styles.statLabel}>Hearts</span>
            </div>
          )}
        </div>

        <div className={styles.mapDescription}>
          <h2>About this map</h2>
          {mapData.description_long.split('\n').map((line, index) => <p key={index}>{line}</p>)}
          <p className={styles.mapAuthor}>
            Created by <strong>{mapData.created_by}</strong>
            {mapData.created_at && (
              ` ${mapData.created_at} ago`
            )}
          </p>
        </div>
        </>
)}
      </main>
    </div>
  );
}

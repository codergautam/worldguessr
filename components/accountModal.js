import { Modal } from "react-responsive-modal";
import { useEffect, useState } from "react";
import AccountView from "./accountView";
import { getLeague, leagues } from "./utils/leagues";
import { signOut } from "@/components/auth/auth";
import { useTranslation } from '@/components/useTranslations';

import FriendsModal from "@/components/friendModal";

export default function AccountModal({ session, shown, setAccountModalOpen, eloData, inCrazyGames, friendModal, accountModalPage, setAccountModalPage, ws, sendInvite, canSendInvite }) {
    const { t: text } = useTranslation("common");

    const [accountData, setAccountData] = useState({});

    const [friends, setFriends] = useState([
    ]);
    const [sentRequests, setSentRequests] = useState([
    ]);
    const [receivedRequests, setReceivedRequests] = useState([
    ]);

    useEffect(() => {
        if (shown) {
            const fetchData = async () => {
                const response = await fetch(window.cConfig.apiUrl + '/api/publicAccount', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ secret: session?.token?.secret }),
                });
                if (response.ok) {
                    const data = await response.json();
                    setAccountData(data);
                } else {
                    alert('An error occurred');
                }
            }
            fetchData();
        }
    }, [shown, session?.token?.secret]);

    if (!eloData) return null;

   


    return (
        <Modal id="accountModal" styles={{
            modal: {
                zIndex: 100,
                background: `linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 30, 15, 0.6) 100%), url("/street2.jpg")`, // dark mode: #333
                color: 'white',
                padding: '0px',
                margin: '0px',
                //borderRadius: '10px',
                fontFamily: "'Arial', sans-serif",
                //maxWidth: '500px',
                textAlign: 'center',
                position: "absolute",
                top: 0,
                left: 0,
                objectFit: "cover",
                backgroundSize: "cover",
                backgroundPosition: "center",
            }
        }} classNames={{ modal: "g2_modal" }} open={shown} center onClose={() => { setAccountModalOpen(false) }} showCloseIcon={false} animationDuration={0}>

            <div className="g2_nav_ui">
                <h1 className="g2_nav_title">{accountData.username}</h1>
                <div className="g2_nav_hr"></div>
                <div className="g2_nav_group">
                    <button className="g2_nav_text" onClick={() => setAccountModalPage("profile") }>{text("profile")}</button>
                </div>
                <div className="g2_nav_hr"></div>
                <div className="g2_nav_group">
                    <button className="g2_nav_text" onClick={() => setAccountModalPage("list")}>
                        { text("friends", {cnt: friends.length })}
                    </button>
                    <button className="g2_nav_text" onClick={() => setAccountModalPage("sent")}>
                        {text("viewSentRequests", { cnt: sentRequests.length })}
                    </button>
                    <button className="g2_nav_text" onClick={() => setAccountModalPage("received")}>
                        {text("viewReceivedRequests", { cnt: receivedRequests.length })}
                    </button>
                    <button className="g2_nav_text" onClick={() => setAccountModalPage("add")}> {text("addFriend")}</button>
                </div>
                <div className="g2_nav_hr"></div>
                <button className="g2_nav_text red" onClick={() => { setAccountModalOpen(false) }}>{text("back")}</button>
            </div>
            <div className="g2_content" style={{ paddingTop: "50px" }}>
                {(accountModalPage == "profile") && (<>
                    <AccountView accountData={accountData} supporter={session?.token?.supporter} eloData={eloData} session={session} />

                    {!inCrazyGames && (
                        <button className="g2_red_button" onClick={() => signOut()} style={{
                            color: 'white',
                            padding: '10px 20px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            marginTop: '20px'
                        }}>
                            {text("logOut")}
                        </button>
                    )}</>
                )}
                {(accountModalPage !== "profile") && (
                    <FriendsModal ws={ws} canSendInvite={canSendInvite} sendInvite={sendInvite} accountModalPage={accountModalPage} setAccountModalPage={setAccountModalPage}
                        friends={friends} setFriends={setFriends} sentRequests={sentRequests} setSentRequests={setSentRequests} receivedRequests={receivedRequests} setReceivedRequests={setReceivedRequests} />
                ) }
            </div>
        </Modal>
    )
}

import { Modal } from "react-responsive-modal";
import { useState, useEffect } from "react";
import { useTranslation } from '@/components/useTranslations';

export default function FriendsModal({ shown, onClose, session, ws, canSendInvite, sendInvite, accountModalPage, setAccountModalPage, friends, setFriends, sentRequests, setSentRequests, receivedRequests, setReceivedRequests }) {
   
    const [friendReqSendingState, setFriendReqSendingState] = useState(0);

    const [friendReqProgress, setFriendReqProgress] = useState(false);
    const [allowFriendReq, setAllowFriendReq] = useState(false);

    const [newFriend, setNewFriend] = useState('');
    //const [accountModalPage, setAccountModalPage] = useState('list');
    const { t: text } = useTranslation("common");

    useEffect(() => {
        if (!ws) return;
        function onMessage(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'friends') {
                setFriends(data.friends);
                setSentRequests(data.sentRequests);
                setReceivedRequests(data.receivedRequests);
                setAllowFriendReq(data.allowFriendReq);
            }
            if (data.type === 'friendReqState') {
                setFriendReqSendingState(data.state);
                setFriendReqProgress(false);
                setNewFriend('');
            }
        }

        ws.addEventListener('message', onMessage);

        return () => {
            ws.removeEventListener('message', onMessage);
        }

    }, [ws]);

    useEffect(() => {
        if (friendReqSendingState > 0) {
            setTimeout(() => {
                setFriendReqSendingState(0);
            }, 5000);
        }
    }, [friendReqSendingState]);

    useEffect(() => {
        let int;
        if (!ws) return;
        if (shown) {
            ws.send(JSON.stringify({ type: 'getFriends' }));
            int = setInterval(() => {
                ws.send(JSON.stringify({ type: 'getFriends' }));
            }, 5000);
        }

        return () => {
            clearInterval(int);
        }
    }, [shown, ws])

    const handleSendRequest = () => {
        if (!ws) return;
        setFriendReqProgress(true);
        ws.send(JSON.stringify({ type: 'sendFriendRequest', name: newFriend }));
    };

    const handleAccept = (id) => {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'acceptFriend', id }));
    };

    const handleDecline = (id) => {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'declineFriend', id }));
    };

    const handleCancel = (id) => {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'cancelRequest', id }));
    };

    const handleRemove = (id) => {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'removeFriend', id }));
    }


    return (
        <div id="friendsModal" style={{

            zIndex: 100,
            //background: '#333',
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            fontFamily: "'Arial', sans-serif",
            textAlign: 'center',
            width: '100%',
            height: '100%',


        }} className={

            'friendsModal'

        } open={shown} center onClose={onClose}>

            {ws && ws.readyState !== 1 && (
                <div>{text("disconnected")}</div>
            )}

            <div className="friendsContent">

                

                <div className="friendsSection">
                    {accountModalPage === "add" && (
                        <div style={{ width: '100%' }}>
                            <h1>{text("addFriend")}</h1>
                            <p>
                                {text("addFriendDescription")}
                            </p>
                            <br />
                            <div className="input-group">

                                <input
                                    type="text"
                                    value={newFriend}
                                    onChange={(e) => setNewFriend(e.target.value)}
                                    placeholder={text("addFriendPlaceholder")}
                                    className="g2_input"
                                />
                                <button onClick={handleSendRequest} className="g2_green_button g2_button_style" disabled={friendReqProgress}>
                                    {friendReqProgress ? text("loading") : text("sendRequest")}
                                </button>



                            </div>
                            <span className="friend-request-sent">
                                {friendReqSendingState === 1 && text("friendReqSent")}
                                {friendReqSendingState === 2 && text("friendReqNotAccepting")}
                                {friendReqSendingState === 3 && text("friendReqNotFound")}
                                {friendReqSendingState === 4 && text("friendReqAlreadySent")}
                                {friendReqSendingState === 5 && text("friendReqAlreadyReceived")}
                                {friendReqSendingState === 6 && text("alreadyFriends")}

                                {friendReqSendingState > 6 && text("friendReqError")}
                            </span>
                        </div>

                    )}


                    {accountModalPage !== "add" && (
                        <div className="friends-list-parent">
                            <h3>
                                {accountModalPage === 'list' && text("friends", { cnt: friends.length })}
                                {accountModalPage === 'sent' && text("sentRequests", { cnt: sentRequests.length })}
                                {accountModalPage === 'received' && text("receivedRequests", { cnt: receivedRequests.length })}
                            </h3>

                            {accountModalPage === 'received' && (
                                <span>
                                    {text("allowFriendRequests")}&nbsp;
                                    {/* check box */}
                                    <input type="checkbox" checked={allowFriendReq} onChange={(e) => ws?.send(JSON.stringify({ type: 'setAllowFriendReq', allow: e.target.checked }))} />

                                </span>
                            )}

                            {accountModalPage === 'list' && friends.length === 0 && (
                                <div>{text("noFriends")}</div>
                            )}
                            {accountModalPage === 'sent' && sentRequests.length === 0 && (
                                <div>{text("noSentRequests")}</div>
                            )}
                            {accountModalPage === 'received' && receivedRequests.length === 0 && (
                                <div>{text("noReceivedRequests")}</div>
                            )}

                            <div className="friends-list">
                                {
                                    (accountModalPage === 'list' ? friends : accountModalPage === 'sent' ? sentRequests : receivedRequests).sort((a, b) => b.online - a.online).map(friend => (
                                        <div key={friend.id} className="friend-card">
                                            <div className="friend-details">
                                                <span className="friend-name">
                                                    {friend?.name}
                                                    {friend?.supporter && <span className="badge">{text("supporter")}</span>}
                                                </span>

                                                {accountModalPage === 'list' && (
                                                    <span className="friend-state">{friend?.online ? text("online") : text("offline")}</span>
                                                )}

                                            </div>

                                            {accountModalPage === 'sent' && (
                                                <button onClick={() => handleCancel(friend.id)} className={"cancel-button"}>✖</button>
                                            )}

                                            {accountModalPage === 'list' && (
                                                <div style={{ float: 'right' }}>
                                                    {canSendInvite && friend.online && friend.socketId && (
                                                        <button onClick={() => sendInvite(friend.socketId)} className={"invite-button"}>{text("invite")}</button>
                                                    )}
                                                    <button onClick={() => handleRemove(friend.id)} className={"cancel-button"}>✖</button>
                                                </div>
                                            )}

                                            {accountModalPage === 'received' && (
                                                <div style={{ float: 'right' }}>
                                                    <button onClick={() => handleAccept(friend.id)} className={"accept-button"}>✔</button>
                                                    <button onClick={() => handleDecline(friend.id)} className={"decline-button"}>✖</button>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                }
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

import { Modal } from "react-responsive-modal";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from '@/components/useTranslations';

export default function FriendsModal({ shown, onClose, session, ws, canSendInvite, sendInvite, accountModalPage, setAccountModalPage, friends, setFriends, sentRequests, setSentRequests, receivedRequests, setReceivedRequests }) {

    const [friendReqSendingState, setFriendReqSendingState] = useState(0);

    const [friendReqProgress, setFriendReqProgress] = useState(false);
    const [allowFriendReq, setAllowFriendReq] = useState(false);

    const [newFriend, setNewFriend] = useState('');
    //const [accountModalPage, setAccountModalPage] = useState('list');
    const { t: text } = useTranslation("common");
    const messageTimeoutRef = useRef(null);

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
            // Clear any existing timeout
            if (messageTimeoutRef.current) {
                clearTimeout(messageTimeoutRef.current);
            }

            // Set new timeout
            messageTimeoutRef.current = setTimeout(() => {
                setFriendReqSendingState(0);
                messageTimeoutRef.current = null;
            }, 5000);
        }

        // Cleanup function to clear timeout on unmount
        return () => {
            if (messageTimeoutRef.current) {
                clearTimeout(messageTimeoutRef.current);
                messageTimeoutRef.current = null;
            }
        };
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
                    {/* Consolidated Friends View */}
                    <div style={{ width: '100%' }}>

                        {/* Add Friend Section */}
                        <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px' }}>
                            <h3>{text("addFriend")}</h3>
                            <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '15px' }}>
                                {text("addFriendDescription")}
                            </p>
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

                        {/* Friend Request Settings */}
                        <div style={{ marginBottom: '30px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
                            <div style={{ marginBottom: '15px' }}>
                                <span>
                                    {text("allowFriendRequests")}&nbsp;
                                    <input type="checkbox" checked={allowFriendReq} onChange={(e) => ws?.send(JSON.stringify({ type: 'setAllowFriendReq', allow: e.target.checked }))} />
                                </span>
                            </div>
                        </div>

                        {/* Received Requests Section */}
                        {receivedRequests.length > 0 && (
                            <div style={{ marginBottom: '30px' }}>
                                <h3>{text("viewReceivedRequests", { cnt: receivedRequests.length })}</h3>
                                <div className="friends-list">
                                    {receivedRequests.map(friend => (
                                        <div key={friend.id} className="friend-card">
                                            <div className="friend-details">
                                                <span className="friend-name">
                                                    {friend?.name}
                                                    {friend?.supporter && <span className="badge">{text("supporter")}</span>}
                                                </span>
                                            </div>
                                            <div style={{ float: 'right' }}>
                                                <button onClick={() => handleAccept(friend.id)} className={"accept-button"}>✔</button>
                                                <button onClick={() => handleDecline(friend.id)} className={"decline-button"}>✖</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sent Requests Section */}
                        {sentRequests.length > 0 && (
                            <div style={{ marginBottom: '30px' }}>
                                <h3>{text("viewSentRequests", { cnt: sentRequests.length })}</h3>
                                <div className="friends-list">
                                    {sentRequests.map(friend => (
                                        <div key={friend.id} className="friend-card">
                                            <div className="friend-details">
                                                <span className="friend-name">
                                                    {friend?.name}
                                                    {friend?.supporter && <span className="badge">{text("supporter")}</span>}
                                                </span>
                                            </div>
                                            <button onClick={() => handleCancel(friend.id)} className={"cancel-button"}>✖</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Friends List Section */}
                        <div>
                            <h3>{text("friends", { cnt: friends.length })}</h3>
                            {friends.length === 0 && (
                                <div>{text("noFriends")}</div>
                            )}
                            <div className="friends-list">
                                {friends.sort((a, b) => b.online - a.online).map(friend => (
                                    <div key={friend.id} className="friend-card">
                                        <div className="friend-details">
                                            <span className="friend-name">
                                                {friend?.name}
                                                {friend?.supporter && <span className="badge">{text("supporter")}</span>}
                                            </span>
                                            <span className="friend-state">{friend?.online ? text("online") : text("offline")}</span>
                                        </div>
                                        <div style={{ float: 'right' }}>
                                            {canSendInvite && friend.online && friend.socketId && (
                                                <button onClick={() => sendInvite(friend.socketId)} className={"invite-button"}>{text("invite")}</button>
                                            )}
                                            <button onClick={() => handleRemove(friend.id)} className={"cancel-button"}>✖</button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

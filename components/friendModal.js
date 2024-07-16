import { Modal } from "react-responsive-modal";
import { useState } from "react";
import { useTranslation } from 'next-i18next';

export default function FriendsModal({ shown, onClose, session }) {
    const [friends, setFriends] = useState([
        { id: 1, name: 'John Doe', status: 'friend' },
        { id: 2, name: 'John DFuoe', status: 'friend' },
    ]);
    const [sentRequests, setSentRequests] = useState([
        { id: 2, name: 'Jane Smith', status: 'pending' }
    ]);
    const [receivedRequests, setReceivedRequests] = useState([
        { id: 3, name: 'Alice Johnson', status: 'request' }
    ]);
    const [newFriend, setNewFriend] = useState('');
    const [viewShown, setViewShown] = useState('list');
    const { t: text } = useTranslation("common");

    const handleSendRequest = () => {
        setSentRequests(prev => [...prev, { id: Date.now(), name: newFriend, status: 'pending' }]);
        setNewFriend('');
    };

    const handleAccept = (id) => {
        setFriends(prev => [...prev, receivedRequests.find(req => req.id === id)]);
        setReceivedRequests(prev => prev.filter(req => req.id !== id));
    };

    const handleDecline = (id) => {
        setReceivedRequests(prev => prev.filter(req => req.id !== id));
    };

    const handleCancel = (id) => {
        setSentRequests(prev => prev.filter(req => req.id !== id));
    };

    return (
        <Modal id="friendsModal" styles={{
            modal: {
                zIndex: 100,
                background: '#333',
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                fontFamily: "'Arial', sans-serif",
                maxWidth: '500px',
                textAlign: 'center',
                width: '50vw',
                height: '70vh',
            }
        }} classNames={
          {
            modal:'friendsModal'
          }
        } open={shown} center onClose={onClose}>


            <div className="friendsContent">

              <div className="friendsTabs">
              <button className={`view-requests-button ${viewShown==='list'?'selected':''}`} onClick={()=>setViewShown("list")}>{text("friends", {cnt: friends.length})}</button>
              <button className={`view-requests-button ${viewShown === "sent" ? "selected" : ""}`} onClick={() => setViewShown("sent")}>
  {text("viewSentRequests", { cnt: sentRequests.length })}
</button>
<button className={`view-requests-button ${viewShown === "received" ? "selected" : ""}`} onClick={() => setViewShown("received")}>
  {text("viewReceivedRequests", { cnt: receivedRequests.length })}
</button>
<button className={`view-requests-button ${viewShown === "add" ? "selected" : ""}`} onClick={() => setViewShown("add")}>
  {text("addFriend")}
</button>

              </div>

              <div className="friendsSection">
                  { viewShown === "add" && (
<div style={{width: '100%'}}>
<h3>{text("addFriend")}</h3>
  <p>
    {text("addFriendDescription")}
  </p>
  <br/>
<div className="input-group">

<input
    type="text"
    value={newFriend}
    onChange={(e) => setNewFriend(e.target.value)}
    placeholder={text("addFriendPlaceholder")}
    className="friend-input"
/>
<button onClick={handleSendRequest} className="send-request-button">
    {text("sendRequest")}
</button>
</div>
</div>

                  )}


                  { viewShown !== "add" && (
                    <div className="friends-list-parent">
                      <h3>
                        { viewShown === 'list' && text("friends", {cnt: friends.length})}
                        { viewShown === 'sent' && text("sentRequests", {cnt: sentRequests.length})}
                        { viewShown === 'received' && text("receivedRequests", {cnt: receivedRequests.length})}
                      </h3>

                      { viewShown === 'list' && friends.length === 0 && (
                        <div>{text("noFriends")}</div>
                      )}
                      { viewShown === 'sent' && sentRequests.length === 0 && (
                        <div>{text("noSentRequests")}</div>
                      )}
                      { viewShown === 'received' && receivedRequests.length === 0 && (
                        <div>{text("noReceivedRequests")}</div>
                      )}

                      <div className="friends-list">
                      {
                        (viewShown === 'list' ? friends : viewShown === 'sent' ? sentRequests : receivedRequests).map(friend => (
                          <div key={friend.id} className="friend-card">
                            <span>{friend?.name}</span>
                            { viewShown === 'sent' && (
                              <button onClick={() => handleCancel(friend.id)} className={"cancel-button"}>✖</button>
                            )}
                            { viewShown === 'received' && (
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
        </Modal>
    )
}

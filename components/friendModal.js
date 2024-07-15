import { Modal } from "react-responsive-modal";
import { useState } from "react";
import { useTranslation } from 'next-i18next';

export default function FriendsModal({ shown, onClose, session }) {
    const [friends, setFriends] = useState([
        { id: 1, name: 'John Doe', status: 'friend' }
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

    const tabs = [
      { key: "list", label: "friends", count: friends.length },
      { key: "sent", label: "viewSentRequests", count: sentRequests.length },
      { key: "received", label: "viewReceivedRequests", count: receivedRequests.length },
      { key: "add", label: "addFriend" },
    ];

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
        <Modal classNames={{
          modal: 'friendsModal'
        }} styles={{
            modal: {
                zIndex: 100,
                background: '#333',
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                fontFamily: "'Arial', sans-serif",
                textAlign: 'center',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '600px',
                height: '50%',
                position: 'relative',
                transform: 'translate(-50%, -50%)',
                          }
        }} open={shown} center onClose={onClose}>

            {/* <h2>{text("friendsText")}</h2> */}

            <div className="friendsContent">

            <div className="friendsTabs">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        className={`view-requests-button ${viewShown === tab.key ? "selected" : ""}`}
        onClick={() => setViewShown(tab.key)}
      >
        {text(tab.label, { cnt: tab.count })}
      </button>
    ))}
  </div>

              <div className="friendsContent">
                  { viewShown === "add" && (
                    <div className="friends-list-parent">
                      <h3>{text("addFriend")}</h3>
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

<div className="friends-list">
                {(viewShown === 'list' ? friends : (viewShown === 'sent' ? sentRequests : receivedRequests)).map(friend => (
                    <div key={friend.id} className="friend-card">
                        <span>{friend.name}</span>
                        { viewShown === 'sent' && (
                        <button onClick={() => handleCancel(friend.id)} className="cancel-button">✖</button>
                        )}
                        { viewShown === 'received' && (
                        <>
                        <button onClick={() => handleAccept(friend.id)} className="accept-button">✔</button>
                        <button onClick={() => handleDecline(friend.id)} className="decline-button">✖</button>
                        </>
                        )}
                    </div>
                ))}
            </div>
                    </div>

                  )}
              </div>
            </div>
        </Modal>
    )
}

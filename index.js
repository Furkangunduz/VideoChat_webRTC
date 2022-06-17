let APP_ID = "f045b940d86743a5909f347100f5f577"

let token = "8432b70826fb421f8a8a57eefb7a28d4"
let uid = String(Math.floor(Math.random() * 1000))

let client
let channel

let localStream
let remoteStream
let peerConnection

let queryString = window.location.search
let urlParams = new URLSearchParams(queryString)
let roomId = urlParams.get("room")

if (!roomId)
    window.location = "lobby.html"

document.getElementById('user-1').volume = 0

const servers = {
    iceServers: [
        {
            urls: ["stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302"]
        }
    ]
}

let init = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    document.getElementById("user-1").srcObject = localStream;

    client = await AgoraRTM.createInstance(APP_ID)
    await client.login({ "uid": uid, "token": null })

    channel = client.createChannel(roomId)
    await channel.join()

    channel.on("MemberJoined", handleUserJoined)

    channel.on("MemberLeft", handleUserLeft)

    client.on("MessageFromPeer", handleMessageFromPeer)
}
let handleUserLeft = () => {
    document.getElementById("user-2").style.display = "none"
}

let handleUserJoined = async (memberId) => {
    console.log("New user Joined ", memberId)
    createOffer(memberId)
}
let handleMessageFromPeer = async (message, memberId) => {
    message = JSON.parse(message.text);
    if (message.type == "offer") {
        console.log("offer ", message.offer)
        await createAnswer(memberId, message.offer)
    }
    else if (message.type == "answer") {
        console.log("answer ", message.answer)
        await addAnswer(message.answer)
    }
    else if (message.type == "candidate") {
        console.log(peerConnection)
        if (peerConnection) {
            await peerConnection.addIceCandidate(message.candidate)
        }
    }
}

let createPeerConnection = async (peerConnection, memberId) => {
    remoteStream = new MediaStream();

    document.getElementById("user-2").srcObject = remoteStream
    document.getElementById("user-2").style.display = "block"

    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        document.getElementById("user-1").srcObject = localStream;
    }
    localStream.getTracks().forEach(async (track) => {
        console.log("onlocalstream")
        await peerConnection.addTrack(track, localStream)
    })

    peerConnection.ontrack = async (event) => {
        console.log("onremotestream")
        event.streams[0].getTracks().forEach(async (track) => {
            await remoteStream.addTrack(track, remoteStream)
        })
    }

    peerConnection.onicecandidate = async (event) => {
        console.log("onicecandidate")
        if (event.candidate)
            await client.sendMessageToPeer({ "text": JSON.stringify({ "type": "candidate", "candidate": event.candidate }) }, memberId)
    }
}

let createOffer = async (memberId) => {
    peerConnection = new RTCPeerConnection(servers)
    await createPeerConnection(peerConnection, memberId)
    let offer = await peerConnection.createOffer();

    await peerConnection.setLocalDescription(new RTCSessionDescription(offer))

    console.log("create offer ", offer)
    console.log("local desc ", peerConnection.localDescription)

    await client.sendMessageToPeer({ "text": JSON.stringify({ "type": "offer", "offer": offer }) }, memberId)

}
let createAnswer = async (memberId, offer) => {
    peerConnection = new RTCPeerConnection(servers)

    await createPeerConnection(peerConnection, memberId)

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

    let answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(new RTCSessionDescription(answer))

    console.log("create answer ", answer)

    await client.sendMessageToPeer({ "text": JSON.stringify({ "type": "answer", "answer": answer }) }, memberId)

}
let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription) {
        console.log("answer added")
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    }
}

let leaveChannel = async () => {
    await peerConnection.close();
    peerConnection = null;
    await channel.leave();
    await client.logout()
}

window.addEventListener("beforeunload", () => leaveChannel())

init()
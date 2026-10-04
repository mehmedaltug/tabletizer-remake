window.addEventListener("pywebviewready", function () {
  window.pywebview.api.get_ip().then(function (ip) {
    let split = ip.split(".");
    for (let i = 0; i < 4; i++)
      document.getElementById("text-" + i).innerHTML = split[i];
  });
});

let connected = false;
let allowed = true;

function sleep(ms, func) {
  new Promise(function (resolve) { setTimeout(resolve, ms) }).then(func)
}

function onConnect(ip) {
  connected = true;
  let split = ip.split("\.");
  document.getElementById("connected-info").innerHTML =
    "Connected to the device with code: " + split[3];
}

function onConnectionClose() {
  connected = false;
  document.getElementById("connected-info").innerHTML =
    "Disconnected to the device!";
}

function onMultiDevice() {
  alert("Can not connect to multiple devices!");
}

function Disconnect() {
  let btn = document.getElementById("button")
  btn.classList.add("clicked");
  sleep(200, function () {
    btn.classList.remove("clicked");
    if (!connected)
      alert("No device is connected!");
    else
      window.pywebview.api.disconnect().then(onConnectionClose)
  })
}

function ChangeAllowance() {
  let lbl = document.getElementById("checkbox-label");
  lbl.classList.add("clicked");
  sleep(200, function () {
    lbl.classList.remove("clicked")
    allowed = document.getElementById("enabled-checkbox").checked;
  
    if (allowed)
      window.pywebview.api.allow().then(function () {alert("Enabled connections.")})
    else
      window.pywebview.api.deny().then(function () {alert("Disabled connections.")})
  })
}
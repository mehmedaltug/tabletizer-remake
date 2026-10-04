import { useEffect, useRef, useState } from "react";
import { NavigationBar } from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";

type ScreenSize = { width: number; height: number };
type MouseButton = "left" | "right";

const PORT = 7070;

export default function HomeScreen() {
  const [octets, setOctets] = useState(["", "", "", ""]);
  const [status, setStatus] = useState("Enter the server's code");
  const [isConnected, setIsConnected] = useState(false);
  const [screenSize, setScreenSize] = useState<ScreenSize | null>(null);
  const [previewSize, setPreviewSize] = useState<ScreenSize>({ width: 0, height: 0 });
  const [heldButtons, setHeldButtons] = useState<MouseButton[]>([]);
  const landscapeLockFailed = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const gestureRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const mousePresses = useRef<Record<MouseButton, boolean>>({ left: false, right: false });

  const sendMessage = (message: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(message);
    return true;
  };

  const clearHeldButtons = () => {
    for (const button of ["left", "right"] as const) {
      if (mousePresses.current[button]) sendMessage(`up,${button}`);
      mousePresses.current[button] = false;
    }
    setHeldButtons([]);
  };

  const connect = () => {
    const values = octets.map((part) => Number(part));
    if (octets.some((part) => part === "") || values.some((part) => part < 0 || part > 255)) {
      setStatus("Enter four numbers between 0 and 255");
      return;
    }

    clearHeldButtons();
    const previousSocket = socketRef.current;
    socketRef.current = null;
    previousSocket?.close();
    landscapeLockFailed.current = false;
    setScreenSize(null);
    setIsConnected(false);
    setStatus("Connecting…");

    try {
      const socket = new WebSocket(`ws://${values.join(".")}:${PORT}`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        setIsConnected(true);
        setStatus("Connected · waiting for screen info");
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
          .then(() => {
            if (socketRef.current !== socket) return ScreenOrientation.unlockAsync();
          })
          .catch(() => {
            if (socketRef.current === socket) {
              landscapeLockFailed.current = true;
              setStatus("Connected · could not switch to landscape");
            }
          });
      };
      socket.onmessage = (event) => {
        if (socketRef.current !== socket || typeof event.data !== "string") return;
        const [kind, widthText, heightText] = event.data.trim().split(",");
        const width = Number(widthText);
        const height = Number(heightText);
        if (kind !== "screen" || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
          setStatus("Connected, but received invalid screen information");
          return;
        }
        setScreenSize({ width, height });
        setStatus(landscapeLockFailed.current ? "Connected · could not switch to landscape" : "Connected");
      };
      socket.onerror = () => {
        if (socketRef.current === socket) setStatus("Could not connect · check the code and server");
      };
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        clearHeldButtons();
        setIsConnected(false);
        setScreenSize(null);
        setStatus("Connection closed · enter the server code to reconnect");
        void ScreenOrientation.unlockAsync().catch(() => {
          setStatus("Connection closed · could not restore screen orientation");
        });
      };
    } catch {
      setStatus("Could not connect · check the code and server");
    }
  };

  const toServerCoordinates = (x: number, y: number) => {
    if (!screenSize || previewSize.width <= 0 || previewSize.height <= 0) return null;
    const clampedX = Math.max(0, Math.min(previewSize.width, x));
    const clampedY = Math.max(0, Math.min(previewSize.height, y));
    return {
      x: Math.round((clampedX / previewSize.width) * screenSize.width),
      y: Math.round((clampedY / previewSize.height) * screenSize.height),
    };
  };

  const sendMove = (x: number, y: number) => {
    const point = toServerCoordinates(x, y);
    if (point) sendMessage(`move,${point.x},${point.y}`);
  };

  const handleScreenTouch = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    if (!gestureRef.current) {
      gestureRef.current = { x: locationX, y: locationY, moved: false };
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture.moved && Math.hypot(locationX - gesture.x, locationY - gesture.y) < 1) return;
    gesture.moved = true;
    sendMove(locationX, locationY);
  };

  const releaseScreenTouch = (event: GestureResponderEvent) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return;

    const { locationX, locationY } = event.nativeEvent;
    if (gesture.moved) sendMove(locationX, locationY);
    else sendMessage("click,left");
  };

  const toggleMouseButton = (button: MouseButton) => {
    const isHeld = mousePresses.current[button];
    if (!sendMessage(`${isHeld ? "up" : "down"},${button}`)) return;
    mousePresses.current[button] = !isHeld;
    setHeldButtons((buttons) =>
      isHeld ? buttons.filter((heldButton) => heldButton !== button) : [...buttons, button],
    );
  };

  const clickMouseButton = (button: MouseButton) => {
    sendMessage(`click,${button}`);
  };

  useEffect(
    () => () => {
      for (const button of ["left", "right"] as const) {
        if (mousePresses.current[button] && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(`up,${button}`);
        }
      }
      socketRef.current?.close();
      void ScreenOrientation.unlockAsync().catch((error: unknown) => {
        console.error("Failed to restore screen orientation", error);
      });
    },
    [],
  );

  const measurePreview = (width: number, height: number) => {
    if (!screenSize || width <= 0 || height <= 0) {
      setPreviewSize({ width: 0, height: 0 });
      return;
    }
    const scale = Math.min(width / screenSize.width, height / screenSize.height);
    setPreviewSize({ width: screenSize.width * scale, height: screenSize.height * scale });
  };

  const showRemoteScreen = isConnected && screenSize !== null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={isConnected} />
      <NavigationBar hidden={isConnected} />
      {showRemoteScreen && screenSize ? (
        <View style={styles.remotePage}>
          <View style={styles.remoteToolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Disconnect from server"
              onPress={() => {
                const socket = socketRef.current;
                clearHeldButtons();
                socketRef.current = null;
                socket?.close();
                setScreenSize(null);
                setIsConnected(false);
                setStatus("Disconnected");
                void ScreenOrientation.unlockAsync().catch(() => {
                  setStatus("Disconnected · could not restore screen orientation");
                });
              }}
              style={styles.disconnectButton}
            >
              <Text style={styles.disconnectText}>Disconnect</Text>
            </Pressable>
          </View>

          <View style={styles.controlStage}>
            <View
              style={styles.previewArea}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                measurePreview(width, height);
              }}
            >
              <View
                accessibilityLabel="Remote screen touch area"
                accessibilityRole="image"
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event) => {
                  gestureRef.current = {
                    x: event.nativeEvent.locationX,
                    y: event.nativeEvent.locationY,
                    moved: false,
                  };
                }}
                onResponderMove={handleScreenTouch}
                onResponderRelease={releaseScreenTouch}
                onResponderTerminate={() => {
                  gestureRef.current = null;
                }}
                style={[
                  styles.remoteScreen,
                  { width: previewSize.width, height: previewSize.height },
                ]}
              >
                <Text style={styles.tapHint}>Tap to click · drag to move</Text>
              </View>
            </View>

            <View style={styles.mouseButtons}>
              {([
                ["left", "click"],
                ["left", "hold"],
                ["right", "click"],
                ["right", "hold"],
              ] as const).map(([button, action]) => {
                const isHold = action === "hold";
                const isHeld = isHold && heldButtons.includes(button);
                return (
                  <Pressable
                    key={`${button}-${action}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      !isHold
                        ? `Click ${button} mouse button`
                        : isHeld
                        ? `Release held ${button} mouse button`
                        : `Toggle ${button} mouse button hold`
                    }
                    accessibilityState={isHold ? { checked: isHeld } : undefined}
                    onPress={() =>
                      isHold ? toggleMouseButton(button) : clickMouseButton(button)
                    }
                    style={({ pressed }) => [
                      styles.mouseButton,
                      (pressed || isHeld) && styles.mouseButtonPressed,
                    ]}
                  >
                    <Text style={styles.mouseButtonText}>{button.toUpperCase()}</Text>
                    <Text style={styles.mouseButtonState}>
                      {isHold ? (isHeld ? "DOWN" : "HOLD") : "CLICK"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

        </View>
      ) : (
        <View style={styles.connectPage}>
          <View style={styles.connectHeading}>
            <View style={styles.brandMark}>
              <View style={styles.brandMarkInner} />
            </View>
            <Text style={styles.eyebrow}>TABLETIZER</Text>
            <Text style={styles.connectTitle}>Connect to{`\n`}your screen.</Text>
            <Text style={styles.connectDescription}>
              Enter the server’s code to control its display from this device.
            </Text>
          </View>

          <View style={styles.connectionCard}>
            <Text style={styles.fieldLabel}>SERVER CODE</Text>
            <View style={styles.ipRow}>
              {octets.map((octet, index) => (
                <View key={index} style={styles.octetGroup}>
                  <TextInput
                    accessibilityLabel={`Server code section ${index + 1}`}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    maxLength={3}
                    onChangeText={(value) => {
                      const next = [...octets];
                      next[index] = value.replace(/\D/g, "");
                      setOctets(next);
                    }}
                    style={styles.octetInput}
                    value={octet}
                  />
                  {index < octets.length - 1 && <Text style={styles.ipDot}>.</Text>}
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={status === "Connecting…"}
              onPress={connect}
              style={({ pressed }) => [
                styles.connectButton,
                pressed && styles.connectButtonPressed,
                status === "Connecting…" && styles.connectButtonDisabled,
              ]}
            >
              <Text style={styles.connectButtonText}>
                {status === "Connecting…" ? "Connecting…" : "Connect to server"}
              </Text>
              <Text style={styles.connectArrow}>→</Text>
            </Pressable>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={[styles.statusText, status.startsWith("Could not") && styles.errorText]}>
                {status}
              </Text>
            </View>
          </View>

          <Text style={styles.connectionHint}>Make sure your device and server are on the same network.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0C1118",
  },
  connectPage: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  connectHeading: {
    marginBottom: 34,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#B7F36B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  brandMarkInner: {
    width: 17,
    height: 17,
    borderColor: "#162018",
    borderWidth: 2,
    borderRadius: 4,
  },
  eyebrow: {
    color: "#9AA8B7",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  connectTitle: {
    color: "#F4F7FA",
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 43,
    marginTop: 12,
  },
  connectDescription: {
    color: "#8D99A7",
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
    maxWidth: 330,
  },
  connectionCard: {
    backgroundColor: "#141C26",
    borderColor: "#25303D",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  fieldLabel: {
    color: "#94A1AF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  ipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  octetGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  octetInput: {
    width: 42,
    height: 54,
    borderColor: "#344150",
    borderWidth: 1,
    borderRadius: 10,
    color: "#F4F7FA",
    fontSize: 19,
    fontWeight: "600",
    textAlign: "center",
    padding: 0,
  },
  ipDot: {
    color: "#758392",
    fontSize: 19,
    marginHorizontal: 2,
  },
  connectButton: {
    height: 54,
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: "#B7F36B",
    paddingHorizontal: 17,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  connectButtonPressed: {
    opacity: 0.82,
  },
  connectButtonDisabled: {
    opacity: 0.55,
  },
  connectButtonText: {
    color: "#152018",
    fontSize: 15,
    fontWeight: "700",
  },
  connectArrow: {
    color: "#152018",
    fontSize: 21,
    fontWeight: "600",
  },
  statusText: {
    color: "#A0ACB8",
    fontSize: 12,
  },
  statusRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#778594",
    marginRight: 8,
  },
  errorText: {
    color: "#F49B8F",
  },
  connectionHint: {
    color: "#647180",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 22,
    paddingHorizontal: 10,
  },
  remotePage: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  remoteToolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  disconnectButton: {
    height: 37,
    paddingHorizontal: 11,
    borderColor: "#344150",
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  disconnectText: {
    color: "#D7DEE6",
    fontSize: 11,
    fontWeight: "600",
  },
  controlStage: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 8,
    marginBottom: 0,
  },
  previewArea: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#111923",
    borderWidth: 1,
    borderColor: "#202C39",
    overflow: "hidden",
  },
  remoteScreen: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderColor: "#B7F36B",
    borderWidth: 1.5,
    borderRadius: 7,
    backgroundColor: "#19232D",
    overflow: "hidden",
  },
  tapHint: {
    color: "#71808F",
    fontSize: 9,
    textAlign: "center",
  },
  mouseButtons: {
    width: 76,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  mouseButton: {
    width: 70,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18222D",
    borderColor: "#2B3947",
    borderWidth: 1,
    borderRadius: 14,
    margin: 3,
  },
  mouseButtonPressed: {
    borderColor: "#B7F36B",
    backgroundColor: "#202D37",
  },
  mouseButtonText: {
    color: "#E3E9EF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  mouseButtonState: {
    color: "#748392",
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: 4,
  },
});

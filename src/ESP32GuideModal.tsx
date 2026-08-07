import React from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const ESP32GuideModal = ({ onClose }: { onClose: () => void }) => {
  const [copied, setCopied] = useState(false);

  const esp32Code = `
#include <Arduino.h>
#include <WiFi.h>
#include <ESP32Servo.h>
#include <FirebaseClient.h>

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define API_KEY "AIzaSyBynSGuocCzlhzZwBdCDIubEwo45Y67vus"
#define DATABASE_URL "https://gen-lang-client-0528271711-default-rtdb.firebaseio.com"

// Define 18 servos for 3 Braille cells (6 dots each)
Servo dotServos[3][6];
const int servoPins[3][6] = {
  {2, 4, 5, 12, 13, 14},   // Cell 1 Pins
  {15, 16, 17, 18, 19, 21}, // Cell 2 Pins
  {22, 23, 25, 26, 27, 32}  // Cell 3 Pins
};

DefaultNetwork network;
UserAuth user_auth(API_KEY, "anonymousemail@example.com", "YOUR_PASSWORD"); // Assuming anonymous or email auth
FirebaseApp app;
RealtimeDatabase Database;
AsyncResult streamResult;

void onStreamEvent(AsyncResult &aNo){
  if (aNo.isEvent()) {
    Serial.println("Stream Event Occurred:");
    FirebaseJson *json = aNo.to<FirebaseJson *>();
    if (json) {
      String jsonStr;
      json->toString(jsonStr, true);
      Serial.println(jsonStr);

      FirebaseJsonData jsonData;
      // Depending on RTDB structure, the stream event data payload is retrieved:
      json->get(jsonData, "data/braille");
      if(jsonData.success) {
         String brailleStr = jsonData.stringValue;
         Serial.print("Received Braille: ");
         Serial.println(brailleStr);
         
         // Update servos
         // for(int i=0; i<brailleStr.length() && i<3; i++) {
         //   processBrailleChar(brailleStr[i], i);
         // }
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi connected.");

  for(int c=0; c<3; c++) {
    for(int d=0; d<6; d++) {
      dotServos[c][d].attach(servoPins[c][d]);
      dotServos[c][d].write(0); // Reset
    }
  }

  app.getApp<DefaultNetwork>(network, user_auth);
  Database.begin(&app, DATABASE_URL);
  
  // Set up the listener on the streaming path
  Database.get(network, streamResult, "/braille_stream/current", onStreamEvent);
}

void processBrailleChar(char c, int cellIndex) {
  // Simple mapping example based on ⠁ ⠃ ⠉ (this needs expanding)
  // For standard 6-dot braille, we push pins up/down.
  // 1 4
  // 2 5
  // 3 6
  // Implement logic based on the received character.
  // Example: '⠁' means dot 1 is UP (represented by servo angle 90)
  Serial.print("Cell ");
  Serial.print(cellIndex);
  Serial.print(": ");
  Serial.println(c);
  // Add your servo angles here
}

void loop() {
  app.loop(); // maintain auth
}
  `.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(esp32Code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-black border-[4px] md:border-[8px] border-white p-6 md:p-10 max-w-4xl w-full relative shadow-2xl my-auto max-h-screen overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 bg-white text-black p-2 hover:bg-zinc-300 transition-colors focus:ring-4 focus:ring-white outline-none"
        >
          <X size={24} />
        </button>
        <h2 className="text-3xl md:text-5xl font-black uppercase mb-6 leading-none tracking-tighter">
          ESP32 + Servo Setup
        </h2>
        <p className="text-lg md:text-xl font-bold mb-6 opacity-80 leading-relaxed">
          Follow these instructions to connect your 18-servo ESP32 Braille Display to your Firebase Database.
        </p>

        <section className="space-y-6 text-left">
            <div>
                <h3 className="text-2xl font-bold uppercase mb-2">1. Hardware Wiring</h3>
                <ul className="list-disc ml-6 opacity-80 text-lg space-y-1">
                    <li>Connect 18 servos to the ESP32. Provide external 5V power for the servos.</li>
                    <li>Wire the signal pins according to the <code>servoPins</code> array in the code below.</li>
                </ul>
            </div>
            
            <div>
                <h3 className="text-2xl font-bold uppercase mb-2">2. Install Libraries</h3>
                <p className="opacity-80 text-lg">In Arduino IDE, install <strong>ESP32Servo</strong> and <strong>FirebaseClient</strong> by Mobizt.</p>
            </div>

            <div>
                <div className="flex items-center justify-between uppercase font-bold mb-2">
                    <h3 className="text-2xl">3. Upload C++ Code</h3>
                    <button 
                        onClick={handleCopy} 
                        className="flex items-center gap-2 bg-zinc-800 px-4 py-2 hover:bg-zinc-700 transition"
                    >
                        {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                        {copied ? "Copied" : "Copy Code"}
                    </button>
                </div>
                <div className="bg-zinc-900 p-4 border border-zinc-700 rounded-sm overflow-x-auto text-sm md:text-base font-mono">
                    <pre className="text-zinc-300"><code>{esp32Code}</code></pre>
                </div>
            </div>
        </section>
      </div>
    </div>
  );
};

export default ESP32GuideModal;

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// --- LIBRERÍAS DE PANTALLA ---
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

// --- DEFINICIÓN DE PINES DE PANTALLA (Ideaspark/TTGO Standard) ---
#define TFT_MOSI 19
#define TFT_SCLK 18
#define TFT_CS    5
#define TFT_DC   16
#define TFT_RST  23
#define TFT_BL    4 

// Inicialización de Pantalla
Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

// --- CONFIGURACIÓN MULTI-WIFI (HASTA 3 REDES) ---
struct WifiCreds {
  const char* ssid;
  const char* pass;
};

// EDITA AQUÍ TUS 3 REDES:
WifiCreds misRedes[] = {
  {"WIFI_CASA_1", "CLAVE_1"},      // Prioridad 1
  {"WIFI_CASA_2", "CLAVE_2"},      // Prioridad 2
  {"DATOS_MOVIL", "CLAVE_MOVIL"}   // Prioridad 3 (Respaldo)
};
const int numRedes = sizeof(misRedes) / sizeof(misRedes[0]);

// --- FIREBASE CREDENCIALES ---
#define API_KEY "TU_API_KEY_FIREBASE"
#define DATABASE_URL "agrocontrol-fd75d-default-rtdb.firebaseio.com"

// --- PINES ACTUADORES ---
const int PIN_BOMBA_MAIN = 13; 
const int PIN_DOSIS_A = 12;    
const int PIN_DOSIS_B = 14;    

// --- OBJETOS FIREBASE ---
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
bool signupOK = false;

// --- VARIABLES DE ESTADO ---
unsigned long lastCycle = 0;
const long interval = 2000; 
String DEVICE_PATH = "/esp32_hydro";
bool estadoBombaMain = false; 
bool estadoAnteriorBomba = !estadoBombaMain; 

// --- DECLARACIÓN DE FUNCIONES ---
void dibujarInterfazBase();
void actualizarIndicadorBomba(bool encendida);
void mostrarAvisoDosis(bool activo, String tipo, int segundos);

void setup() {
  Serial.begin(115200);

  // 1. INICIAR PANTALLA
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH); 
  
  tft.init(170, 320);           
  tft.setRotation(1);           
  tft.fillScreen(ST77XX_BLACK);
  
  // Mensaje de Inicio
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(10, 20);
  tft.println("ROSLIN APP");
  tft.setTextSize(1);
  tft.setCursor(10, 50);
  tft.println("Sistema Hidroponico");

  // 2. INICIAR PINES
  pinMode(PIN_BOMBA_MAIN, OUTPUT);
  pinMode(PIN_DOSIS_A, OUTPUT);
  pinMode(PIN_DOSIS_B, OUTPUT);
  
  digitalWrite(PIN_BOMBA_MAIN, HIGH); 
  digitalWrite(PIN_DOSIS_A, LOW);
  digitalWrite(PIN_DOSIS_B, LOW);

  // 3. LÓGICA DE CONEXIÓN MULTI-WIFI
  bool conectado = false;
  
  // Bucle para intentar cada red
  for (int i = 0; i < numRedes; i++) {
    // Si el nombre de la red está vacío, saltar
    if (strlen(misRedes[i].ssid) == 0) continue;

    // Actualizar Pantalla con la red actual
    tft.fillRect(0, 70, 320, 40, ST77XX_BLACK); // Borrar texto anterior
    tft.setCursor(10, 70);
    tft.setTextColor(ST77XX_YELLOW);
    tft.printf("Probando Red %d:\n%s", i + 1, misRedes[i].ssid);
    Serial.printf("\nIntentando conectar a: %s", misRedes[i].ssid);

    WiFi.begin(misRedes[i].ssid, misRedes[i].pass);

    // Esperar hasta 10 segundos por red
    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
      delay(500);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      conectado = true;
      tft.setTextColor(ST77XX_GREEN);
      tft.println("\nCONECTADO!");
      delay(1000); // Pausa para que el usuario vea el éxito
      break; // Salir del bucle for, ya tenemos internet
    } else {
      Serial.println(" Fallo.");
    }
  }

  // Si después de probar las 3 redes no hay conexión:
  if (!conectado) {
    tft.fillScreen(ST77XX_RED);
    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(10, 50);
    tft.println("ERROR WIFI:");
    tft.println("Ninguna red disponible");
    tft.println("Reiniciando en 5s...");
    delay(5000);
    ESP.restart(); // Reiniciar para volver a intentar
  }
  
  // Actualizar Pantalla Final con IP
  tft.fillScreen(ST77XX_BLACK);
  dibujarInterfazBase();
  Serial.println("\nIP Asignada: " + WiFi.localIP().toString());

  // 4. CONFIGURAR FIREBASE
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  
  if (Firebase.signUp(&config, &auth, "", "")) {
    signupOK = true;
  }
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  if (Firebase.ready() && signupOK && (millis() - lastCycle > interval)) {
    lastCycle = millis();

    // --- 1. CONTROL BOMBA PRINCIPAL ---
    if (Firebase.RTDB.getBool(&fbdo, DEVICE_PATH + "/bomba_main")) {
      bool estadoFirebase = fbdo.boolData();
      
      if (estadoFirebase != estadoBombaMain) {
        estadoBombaMain = estadoFirebase;
        digitalWrite(PIN_BOMBA_MAIN, estadoBombaMain ? LOW : HIGH); 
        actualizarIndicadorBomba(estadoBombaMain);
      }
    }

    // --- 2. CONTROL DOSIFICACIÓN ---
    if (Firebase.RTDB.getInt(&fbdo, DEVICE_PATH + "/dosis_a_sec")) {
      int seg = fbdo.intData();
      if (seg > 0) {
        mostrarAvisoDosis(true, "Nutriente A", seg);
        
        Serial.printf("Dosificando A por %d seg\n", seg);
        digitalWrite(PIN_DOSIS_A, HIGH);
        
        delay(seg * 1000); 
        
        digitalWrite(PIN_DOSIS_A, LOW); 
        
        Firebase.RTDB.setInt(&fbdo, DEVICE_PATH + "/dosis_a_sec", 0);
        
        mostrarAvisoDosis(false, "", 0);
        actualizarIndicadorBomba(estadoBombaMain);
      }
    }
  }
}

// --- FUNCIONES GRÁFICAS ---

void dibujarInterfazBase() {
  tft.fillRect(0, 0, 320, 30, ST77XX_BLUE);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(10, 5);
  tft.print("AgroControl V2");
  
  tft.setTextSize(1);
  tft.setCursor(200, 10);
  tft.print(WiFi.localIP());

  tft.setCursor(10, 50);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_CYAN);
  tft.print("Oxigenacion:");
  
  tft.setCursor(10, 100);
  tft.print("Estado:");
  
  actualizarIndicadorBomba(estadoBombaMain);
}

void actualizarIndicadorBomba(bool encendida) {
  tft.fillRect(160, 45, 100, 30, ST77XX_BLACK);
  
  tft.setTextSize(2);
  if (encendida) {
    tft.setTextColor(ST77XX_GREEN);
    tft.setCursor(160, 50);
    tft.print("ACTIVA");
    tft.fillCircle(280, 57, 10, ST77XX_GREEN);
  } else {
    tft.setTextColor(ST77XX_RED);
    tft.setCursor(160, 50);
    tft.print("APAGADA");
    tft.drawCircle(280, 57, 10, ST77XX_RED);
  }
}

void mostrarAvisoDosis(bool activo, String tipo, int segundos) {
  if (activo) {
    tft.fillRect(20, 90, 280, 60, ST77XX_ORANGE);
    tft.setTextColor(ST77XX_BLACK);
    tft.setTextSize(2);
    tft.setCursor(40, 100);
    tft.print("DOSIFICANDO...");
    tft.setCursor(40, 125);
    tft.print(tipo + ": " + String(segundos) + "s");
  } else {
    tft.fillRect(20, 90, 280, 60, ST77XX_BLACK);
    tft.setTextColor(ST77XX_CYAN);
    tft.setCursor(10, 100);
    tft.print("Estado:");
    tft.setTextColor(ST77XX_WHITE);
    tft.setCursor(100, 100);
    tft.print("Monitoreando...");
  }
}
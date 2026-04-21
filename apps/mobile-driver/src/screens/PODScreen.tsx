// apps/mobile-driver/src/screens/PODScreen.tsx
/**
 * Proof of Delivery screen
 * - Camera capture (expo-camera)
 * - E-signature (react-native-signature-canvas)
 * - COD cash collection
 * - Uploads to S3/R2 then calls status update API
 */
import React, { useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, TextInput, ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import SignatureCanvas from "react-native-signature-canvas";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../hooks/useAuthStore";
import { uploadPOD, completeDelivery } from "../services/api";

type Step = "PHOTO" | "SIGNATURE" | "COD" | "CONFIRM";

export default function PODScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId, orderNo, codAmount } = route.params;
  const { token } = useAuthStore();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("PHOTO");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [codCollected, setCodCollected] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!photoUri) throw new Error("Photo required");

      // 1. Upload photo
      const photoKey = await uploadPOD(token!, { uri: photoUri, type: "photo", orderId });

      // 2. Upload signature (base64 PNG)
      let sigKey: string | undefined;
      if (signatureData) {
        sigKey = await uploadPOD(token!, {
          uri: signatureData,
          type: "signature",
          orderId,
          isBase64: true,
        });
      }

      // 3. Mark as delivered
      await completeDelivery(token!, {
        orderId,
        podPhoto: photoKey,
        podSignature: sigKey,
        recipientName,
        codCollected: !!codAmount && codCollected,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-jobs"] });
      Alert.alert("Delivered!", `Order ${orderNo} marked as delivered.`, [
        { text: "Done", onPress: () => nav.navigate("JobList") },
      ]);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  async function capturePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    if (photo) {
      setPhotoUri(photo.uri);
      setStep("SIGNATURE");
    }
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access is needed for proof of delivery.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      {/* Header */}
      <Text style={styles.title}>Proof of Delivery</Text>
      <Text style={styles.sub}>{orderNo}</Text>

      {/* Step indicator */}
      <View style={styles.steps}>
        {(["PHOTO", "SIGNATURE", ...(codAmount ? ["COD"] : []), "CONFIRM"] as Step[]).map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, step === s && styles.stepDotActive, (step > s) && styles.stepDotDone]}>
              <Text style={styles.stepNum}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>{s}</Text>
          </View>
        ))}
      </View>

      {/* STEP 1 — Photo */}
      {step === "PHOTO" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Take a photo of the delivered package</Text>
          <View style={styles.camera}>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          </View>
          <TouchableOpacity style={styles.btn} onPress={capturePhoto}>
            <Text style={styles.btnText}>Capture photo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* STEP 2 — Signature */}
      {step === "SIGNATURE" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recipient signature</Text>
          <TextInput
            style={styles.input}
            placeholder="Recipient name"
            placeholderTextColor="#475569"
            value={recipientName}
            onChangeText={setRecipientName}
          />
          <View style={styles.sigCanvas}>
            <SignatureCanvas
              onOK={(sig) => setSignatureData(sig)}
              backgroundColor="white"
              penColor="#1e293b"
              descriptionText="Sign above"
              clearText="Clear"
              confirmText="Confirm"
              webStyle=".m-signature-pad--footer { display: none; }"
            />
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep("PHOTO")}>
              <Text style={styles.btnSecText}>← Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => setStep(codAmount ? "COD" : "CONFIRM")}
            >
              <Text style={styles.btnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* STEP 3 — COD collection (conditional) */}
      {step === "COD" && codAmount && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Collect cash on delivery</Text>
          <View style={styles.codBox}>
            <Text style={styles.codLabel}>Amount to collect</Text>
            <Text style={styles.codAmount}>RM {Number(codAmount).toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.checkRow]}
            onPress={() => setCodCollected((v) => !v)}
          >
            <View style={[styles.checkbox, codCollected && styles.checkboxChecked]} />
            <Text style={styles.checkLabel}>Cash collected from recipient</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep("SIGNATURE")}>
              <Text style={styles.btnSecText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, !codCollected && styles.btnDisabled]}
              disabled={!codCollected}
              onPress={() => setStep("CONFIRM")}
            >
              <Text style={styles.btnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* STEP 4 — Confirm */}
      {step === "CONFIRM" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready to submit</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Order</Text><Text style={styles.summaryVal}>{orderNo}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Photo</Text><Text style={styles.summaryVal}>{photoUri ? "✓ Captured" : "—"}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Signature</Text><Text style={styles.summaryVal}>{signatureData ? "✓ Signed" : "Skipped"}</Text></View>
          {codAmount && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>COD</Text><Text style={[styles.summaryVal, { color: "#22c55e" }]}>RM {Number(codAmount).toFixed(2)} collected</Text></View>}

          <TouchableOpacity
            style={[styles.btn, submitMutation.isPending && styles.btnDisabled]}
            onPress={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Confirm delivery</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0f172a" },
  title: { fontSize: 22, fontWeight: "700", color: "#f1f5f9", marginTop: 52 },
  sub: { fontSize: 13, color: "#3b82f6", fontFamily: "monospace", marginBottom: 20 },
  steps: { flexDirection: "row", justifyContent: "center", gap: 20, marginBottom: 24 },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#334155" },
  stepDotActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  stepDotDone: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  stepNum: { fontSize: 12, color: "#94a3b8", fontWeight: "600" },
  stepLabel: { fontSize: 10, color: "#475569" },
  stepLabelActive: { color: "#3b82f6" },
  section: { gap: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#e2e8f0", marginBottom: 4 },
  camera: { height: 300, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" },
  sigCanvas: { height: 220, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" },
  input: { backgroundColor: "#1e293b", borderRadius: 10, padding: 14, color: "#e2e8f0", fontSize: 15, borderWidth: 1, borderColor: "#334155" },
  btn: { backgroundColor: "#3b82f6", borderRadius: 12, padding: 16, alignItems: "center" },
  btnSecondary: { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, alignItems: "center", flex: 1 },
  btnSecText: { color: "#94a3b8", fontWeight: "600" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
  row: { flexDirection: "row", gap: 12 },
  codBox: { backgroundColor: "#1e293b", borderRadius: 12, padding: 20, alignItems: "center", gap: 8 },
  codLabel: { fontSize: 13, color: "#64748b" },
  codAmount: { fontSize: 32, fontWeight: "700", color: "#22c55e" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#1e293b", borderRadius: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#475569" },
  checkboxChecked: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  checkLabel: { color: "#e2e8f0", fontSize: 14 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  summaryLabel: { color: "#64748b", fontSize: 14 },
  summaryVal: { color: "#e2e8f0", fontSize: 14, fontWeight: "500" },
  permText: { color: "#94a3b8", textAlign: "center", marginBottom: 16 },
});

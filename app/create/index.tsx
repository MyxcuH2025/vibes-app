import { useState } from "react";
import {
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  requestMediaLibraryPermissionsAsync,
  requestCameraPermissionsAsync,
  launchImageLibraryAsync,
  launchCameraAsync,
  type ImagePickerAsset,
} from "expo-image-picker";
import { generateAndUploadThumbnail, uploadPostMedia } from "@/lib/uploadMedia";
import { useAuthStore } from "@/lib/authStore";
import { useGuildInfo } from "@/lib/usePosts";
import { useCreatePost } from "@/lib/usePostManagement";
import {
  CreateProgressBar,
  CreateHeader,
  CreateMediaPicker,
  CreateCaptionField,
  CreateTagPicker,
  CreateGuildBanner,
  createStyles as styles,
} from "@/components/create";

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { mutateAsync: createPost } = useCreatePost();
  const { data: guildInfo } = useGuildInfo(profile?.guild_id ?? null);

  const [image, setImage] = useState<ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const pickImage = async () => {
    const { status } = await requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Berechtigung erforderlich",
        "Bitte erlaube den Zugriff auf deine Fotos.",
      );
      return;
    }
    const result = await launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets[0]) setImage(result.assets[0]);
  };

  const takePhoto = async () => {
    const { status } = await requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Berechtigung erforderlich",
        "Bitte erlaube den Kamera-Zugriff.",
      );
      return;
    }
    const result = await launchCameraAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets[0]) setImage(result.assets[0]);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag].slice(0, 4),
    );
  };

  const handlePost = async () => {
    if (!profile) return;
    if (!image && !caption.trim()) {
      Alert.alert("Fehler", "Füge ein Bild oder eine Caption hinzu.");
      return;
    }

    setUploading(true);
    setUploadPct(0);

    try {
      let mediaUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      const mediaType = image?.type === "video" ? "video" : "image";

      if (image) {
        const mimeType = image.mimeType ?? "image/jpeg";
        const { url } = await uploadPostMedia(
          profile.id,
          image.uri,
          mimeType,
          (pct) => setUploadPct(pct),
        );
        mediaUrl = url;
        thumbnailUrl =
          mediaType === "video"
            ? await generateAndUploadThumbnail(profile.id, image.uri)
            : url;
      }

      await createPost({
        caption: caption.trim() || null,
        mediaUrl,
        mediaType,
        thumbnailUrl,
        tags: selectedTags.map((t) => t.toLowerCase()),
        isGuildPost: false,
        guildId: profile.guild_id,
      });

      Alert.alert("🎉 Vibe gepostet!", "Dein Post ist jetzt im Feed.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Upload fehlgeschlagen.";
      Alert.alert("Fehler", message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <CreateProgressBar visible={uploading} progress={uploadPct} />

      <CreateHeader
        onClose={() => router.back()}
        onPost={handlePost}
        uploading={uploading}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <CreateMediaPicker
          asset={image}
          onPickLibrary={pickImage}
          onOpenCamera={takePhoto}
        />

        <CreateCaptionField
          usernameInitial={profile?.username?.[0]?.toUpperCase() ?? "?"}
          caption={caption}
          onChangeCaption={setCaption}
        />

        <CreateTagPicker selectedTags={selectedTags} onToggleTag={toggleTag} />

        {guildInfo ? <CreateGuildBanner guildName={guildInfo.name} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

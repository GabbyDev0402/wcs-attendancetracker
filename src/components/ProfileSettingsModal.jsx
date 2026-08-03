import React, { useState } from "react";
import { auth, db } from "../firebase/config";
import { updateProfile, updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { X, Settings, Camera, Key, User, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

/**
 * Base64 Image Compression Canvas Pipeline
 * Resizes images to a maximum width of 200px and exports as lightweight Base64 JPEG.
 */
export const compressImageToBase64 = (file, maxWidth = 200, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = (err) => reject(err);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const base64Str = canvas.toDataURL("image/jpeg", quality);
        resolve(base64Str);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
};

export default function ProfileSettingsModal({ isOpen, onClose }) {
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.name || user?.displayName || "");
  const [newPassword, setNewPassword] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState(user?.photoURL || user?.avatar || "");
  const [selectedFile, setSelectedFile] = useState(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select a valid image file.");
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewPhoto(objectUrl);
    setErrorMsg("");
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMsg("No active authenticated user session found.");
      return;
    }

    setIsSaving(true);

    try {
      let finalBase64Photo = user?.photoURL || user?.avatar || "";

      // Convert and compress file if a new file was uploaded
      if (selectedFile) {
        finalBase64Photo = await compressImageToBase64(selectedFile, 200, 0.7);
      }

      const updatedName = displayName.trim() || user?.name || "User";

      // 1. Update Firebase Auth user profile
      await updateProfile(currentUser, {
        displayName: updatedName,
        photoURL: finalBase64Photo
      });

      // 2. Update Firestore user document
      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        name: updatedName,
        photoURL: finalBase64Photo,
        avatar: finalBase64Photo,
        updatedAt: new Date().toISOString()
      });

      // 3. Update password if filled
      if (newPassword && newPassword.trim().length > 0) {
        if (newPassword.trim().length < 6) {
          throw new Error("Password must be at least 6 characters long.");
        }
        try {
          await updatePassword(currentUser, newPassword.trim());
        } catch (passErr) {
          if (passErr.code === "auth/requires-recent-login" || passErr.message?.includes("requires-recent-login")) {
            setErrorMsg("Changing your password requires a recent login. Please log out and log back in, then try updating your password again.");
            setIsSaving(false);
            return;
          } else {
            throw passErr;
          }
        }
      }

      // 4. Refresh global AuthContext user state
      if (refreshUser) {
        await refreshUser();
      }

      setSuccessMsg("Profile settings updated successfully!");
      setTimeout(() => {
        setSuccessMsg("");
        onClose();
      }, 1500);

    } catch (err) {
      console.error("Failed to update profile settings:", err);
      setErrorMsg("Failed to update profile: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up transition-colors">
        {/* Modal Header */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
              My Profile Settings
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Update your display name, password, and avatar.
            </p>
          </div>
        </div>

        {/* Feedback Banners */}
        {errorMsg && (
          <div className="mb-4 flex items-start space-x-2 rounded-xl bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 transition-colors">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 flex items-center space-x-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50 transition-colors animate-pulse">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-5">
          {/* Avatar Upload Section */}
          <div className="flex flex-col items-center justify-center space-y-3 pb-2">
            <div className="relative group">
              <img
                src={previewPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user?.id || 'admin'}`}
                alt={displayName}
                className="h-20 w-20 rounded-full object-cover border-2 border-brand-500/50 shadow-md bg-slate-100 dark:bg-slate-800"
              />
              <label className="absolute bottom-0 right-0 p-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-md cursor-pointer transition-transform hover:scale-105">
                <Camera className="h-3.5 w-3.5" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
              Click camera icon to upload new photo (auto-compressed)
            </span>
          </div>

          {/* Display Name Input */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
              Display Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Admin Name"
                className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          {/* New Password Input */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
              New Password <span className="font-normal text-slate-400 dark:text-slate-500">(Optional)</span>
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, ImagePlus, X, BotMessageSquare, RefreshCcw } from "lucide-react";
import { MessageBlock, MessageProps } from "@/components/MessageBlock";

export default function ChatPage() {
  const [messages, setMessages] = useState<MessageProps[]>([]);
  const [input, setInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto scroll to bottom smoothly when messages change
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const processFile = (file: File) => {
    // Check if it's an image or PDF
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      alert("画像ファイルまたはPDFファイルのみ対応しています。");
      return;
    }

    // Check size limit (e.g. 20MB)
    if (file.size > 20 * 1024 * 1024) {
      alert("ファイルサイズが大きすぎます（20MB以下のファイルを選択してください）。");
      return;
    }

    if (file.type.startsWith("image/")) {
      // 画像の場合はクライアント側で圧縮・リサイズを行う（Vercelの4.5MB制限対策）
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new window.Image();
        img.onload = () => {
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height *= MAX_WIDTH / width));
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width *= MAX_HEIGHT / height));
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // 軽量なJPEG形式に変換しデータ量を抑える
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
            setImagePreview(compressedDataUrl);
          } else {
            setImagePreview(reader.result as string);
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      // PDF等の場合はそのまま読み込む
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }

    // reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1 || items[i].type === "application/pdf") {
        const file = items[i].getAsFile();
        if (file) {
          processFile(file);
          e.preventDefault();
          break;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const removeImage = () => {
    setImagePreview(null);
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleResetChat = () => {
    if (messages.length === 0) return;
    if (window.confirm("会話の履歴をリセットして、新しい問題をはじめますか？")) {
      setMessages([]);
      setInput("");
      setImagePreview(null);
    }
  };

  const handleSubmit = async () => {
    if ((!input.trim() && !imagePreview) || isLoading) return;

    const userMsg: MessageProps = {
      id: Date.now().toString(),
      role: "user",
      text: input,
      image: imagePreview || undefined,
    };

    // Prepare history for API (convert "ai" role to "model" for Gemini)
    const history = messages.map(msg => ({
      role: msg.role === "ai" ? "model" : "user",
      parts: [{ text: msg.text }]
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setImagePreview(null);
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const aiMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "ai", text: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, image: userMsg.image, history }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let aiText = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          aiText += chunk;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMsgId ? { ...msg, text: aiText } : msg
            )
          );
        }
      }
    } catch (error) {
      console.error("Failed to generate response:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMsgId
            ? { ...msg, text: "エラーが発生しました。もう一度お試しください。" }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <BotMessageSquare size={24} style={{ color: "#a78bfa", marginRight: "8px" }} />
          <h1 style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            AIチューターカガワさん
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "normal" }}>V1.0.1</span>
          </h1>
        </div>

        {messages.length > 0 && (
          <button
            className="btn-icon"
            onClick={handleResetChat}
            title="新しく始める"
            style={{ padding: "6px 10px", fontSize: "0.8rem", gap: "4px" }}
          >
            <RefreshCcw size={14} />
            <span className="reset-text">リセット</span>
          </button>
        )}
      </header>

      {/* Chat Area */}
      <div className="chat-container" ref={chatContainerRef}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: "40px", color: "var(--text-muted)" }}>
            <BotMessageSquare size={48} style={{ opacity: 0.5, marginBottom: "16px" }} />
            <h2>分からない問題を質問しよう</h2>
            <p style={{ marginTop: "8px", fontSize: "0.9rem" }}>
              教科書の写真やPDFと「どこが分からないか」を送ると、
              ヒントや解き方を一緒に考えてくれるよ。
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <MessageBlock key={msg.id} message={msg} />
          ))
        )}

        {isLoading && (
          <div className="message-wrapper message-ai">
            <div className="message-bubble" style={{ padding: "16px", backgroundColor: "var(--ai-msg)", border: "1px solid var(--border-color)", borderBottomLeftRadius: "4px" }}>
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className="input-area"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {imagePreview && (
          <div className="image-preview-container">
            {imagePreview.startsWith("data:application/pdf") ? (
              <div style={{ width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#334155", borderRadius: 6, fontSize: "0.8rem", color: "#fff" }}>PDF</div>
            ) : (
              <img src={imagePreview} alt="Preview" />
            )}
            <button className="remove-image-btn" onClick={removeImage}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="input-controls">
          <button
            className="action-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            aria-label="画像・PDFをアップロード"
          >
            <ImagePlus size={20} />
          </button>
          <input
            type="file"
            accept="image/*,application/pdf"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="file-input"
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="メッセージを入力... (画像やPDFをドロップ/ペーストできます)"
            disabled={isLoading}
            rows={1}
          />

          <button
            className="action-btn send-btn"
            onClick={handleSubmit}
            disabled={(!input.trim() && !imagePreview) || isLoading}
            aria-label="送信"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

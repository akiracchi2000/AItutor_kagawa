"use client";

import React, { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Bot, User } from "lucide-react";

export interface MessageProps {
    id: string;
    role: "user" | "ai";
    text: string;
    image?: string; // base64 string
}

export function MessageBlock({ message }: { message: MessageProps }) {
    const blockRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    return (
        <div
            id={`message-wrapper-${message.id}`}
            ref={wrapperRef}
            className={`message-wrapper ${message.role === "user" ? "message-user" : "message-ai"}`}
        >
            <div
                ref={blockRef}
                className="message-bubble"
                style={{
                    padding: message.role === "ai" ? "16px" : "12px 16px",
                    backgroundColor: message.role === "user" ? "#3b82f6" : "#334155",
                    color: "#f8fafc"
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    {message.role === "user" ? <User size={18} /> : <Bot size={18} />}
                    <span style={{ fontSize: "0.85rem", opacity: 0.8, fontWeight: 600 }}>
                        {message.role === "user" ? "あなた" : "カガワさん"}
                    </span>
                </div>

                {message.image && (
                    <img src={message.image} alt="User Attachment" className="preview-image" />
                )}

                <div className="prose">
                    {message.role === "user" ? (
                        <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                    ) : (
                        <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                        >
                            {message.text}
                        </ReactMarkdown>
                    )}
                </div>
            </div>
        </div>
    );
}

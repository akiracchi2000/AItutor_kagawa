import { GoogleGenerativeAI } from "@google/generative-ai";

// Next.js App Router API Route
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `あなたは高校2年生を指導する、非常に優秀で熱心な専属チューターです。ユーザーから送られた画像や質問を正確に読み取り、以下のルールに従って回答してください。
・いきなり最終的な答えだけを教えるのは禁止です。生徒が自分で思考できるようにサポートしてください。
・解説やヒントは『より具体的に』提示してください。例えば『公式を使って』という曖昧な指示ではなく、『図の三角形ABCに三平方の定理を当てはめてみよう』のように、具体的な着眼点や次にすべき計算のステップを明確に示してください。
・数式を出力する際は、必ずLaTeX形式で出力してください。
・重要な語句を強調表示するためのMarkdown記号（太字の「**」やインラインコード等）を使う場合は、日本語テキストとの区切りを明確にし正しくハイライトさせるため、必ず記号の【外側】に【半角スペース】を入れ、記号の内側にはスペースを入れないでください。（例: これは **太字** です）`;

export async function POST(req: Request) {
    try {
        // history: { role: "user" | "model", parts: [{ text: string }, ...] }[]
        const { message, image, history = [] } = await req.json();

        if (!process.env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY environment variable" }), { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        // Attempt to use gemini-3.1-pro-preview, fallback to gemini-2.5-pro if unavailable/fails
        const modelName = "gemini-3.1-pro-preview";
        const fallbackModelName = "gemini-2.5-pro";

        let generativeModel = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_PROMPT });

        const contents = [];
        const parts = [];

        if (image) {
            // image is a base64 string like "data:image/jpeg;base64,..." or "data:application/pdf;base64,..."
            const base64Data = image.split(",")[1];
            const mimeType = image.split(";")[0].split(":")[1];

            parts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType,
                },
            });
        }

        parts.push({ text: message });

        // Build the chat session
        let chat;
        let responseStream;

        try {
            chat = generativeModel.startChat({ history });
            let result = await chat.sendMessageStream(parts);
            responseStream = result.stream;
        } catch (error: any) {
            console.warn(`Model ${modelName} failed / unavailable.Falling back to ${fallbackModelName}.Error: ${error.message} `);
            generativeModel = genAI.getGenerativeModel({ model: fallbackModelName, systemInstruction: SYSTEM_PROMPT });
            chat = generativeModel.startChat({ history });
            let result = await chat.sendMessageStream(parts);
            responseStream = result.stream;
        }

        // Set up a ReadableStream
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of responseStream) {
                        const chunkText = chunk.text();
                        if (chunkText) {
                            controller.enqueue(new TextEncoder().encode(chunkText));
                        }
                    }
                } catch (streamError) {
                    console.error("Streaming error:", streamError);
                    controller.error(streamError);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(readableStream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error: any) {
        console.error("Chat API Route Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

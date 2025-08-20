import type { APIRoute } from "astro";
import { google } from "googleapis";
import { getCallbackUrl } from "../../lib/config";

export const GET: APIRoute = async ({ cookies }) => {
  const tokensString = cookies.get("tokens")?.value;

  if (!tokensString) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const tokens = JSON.parse(tokensString);

    const oauth2Client = new google.auth.OAuth2(
      import.meta.env.GOOGLE_CLIENT_ID,
      import.meta.env.GOOGLE_CLIENT_SECRET,
      getCallbackUrl(),
    );

    oauth2Client.setCredentials(tokens);

    const admin = google.admin({ version: "directory_v1", auth: oauth2Client });
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (type: string, data: any) => {
          const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          // Get all users first
          const response = await admin.users.list({
            customer: "my_customer",
            maxResults: 100,
            orderBy: "email",
          });

          const users = response.data.users || [];
          const totalUsers = users.length;

          // Send initial event with total count
          sendEvent("start", { totalUsers });

          const BATCH_SIZE = 2;
          let processedCount = 0;
          let currentBatch = [];

          // Process users in batches
          for (const user of users) {
            let fileCount = 0;
            let emailCount = 0;
            let totalStorageBytes = 0;

            // Get file count
            try {
              let allFiles = [];
              let nextPageToken = "";

              do {
                const pageResponse = await drive.files.list({
                  q: `'${user.primaryEmail}' in owners and trashed=false`,
                  pageSize: 1000,
                  pageToken: nextPageToken || undefined,
                  fields: "files(id,size), nextPageToken",
                });

                allFiles.push(...(pageResponse.data.files || []));
                nextPageToken = pageResponse.data.nextPageToken || "";
              } while (nextPageToken);

              fileCount = allFiles.length;
              totalStorageBytes = allFiles.reduce((total, file) => {
                const size = file.size ? parseInt(file.size, 10) : 0;
                return total + size;
              }, 0);
            } catch (driveErr) {
              console.warn(
                `Failed to get file count for ${user.primaryEmail}:`,
                driveErr instanceof Error ? driveErr.message : "Unknown error",
              );
            }

            // Get email count
            try {
              const profile = await gmail.users.getProfile({
                userId: user.primaryEmail || "me",
              });

              emailCount = profile.data.messagesTotal || 0;
            } catch (gmailErr) {
              console.warn(
                `Failed to get email count for ${user.primaryEmail}:`,
                gmailErr instanceof Error ? gmailErr.message : "Unknown error",
              );
            }

            const storageMB = totalStorageBytes / (1024 * 1024);
            const storageGB = storageMB / 1024;

            const enhancedUser = {
              ...user,
              fileCount,
              emailCount,
              totalStorageBytes,
              storageMB: Math.round(storageMB * 100) / 100,
              storageGB: Math.round(storageGB * 100) / 100,
            };

            currentBatch.push(enhancedUser);
            processedCount++;

            // Send batch when it reaches BATCH_SIZE or it's the last user
            if (
              currentBatch.length === BATCH_SIZE ||
              processedCount === totalUsers
            ) {
              sendEvent("batch", {
                users: currentBatch,
                processedCount,
                totalUsers,
                isComplete: processedCount === totalUsers,
              });

              currentBatch = [];
            }

            // Small delay to prevent overwhelming the APIs
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          // Send completion event
          sendEvent("complete", { processedCount, totalUsers });
        } catch (error) {
          sendEvent("error", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to start stream",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};


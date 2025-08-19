import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { navigate } from 'astro:transitions/client';
import { google } from 'googleapis'

export const server = {
    login: defineAction({
        handler: async (_, { request, cookies }) => {
            console.log("login handler called");
            const scopes = [
                "openid",
                "profile",
                // Admin SDK scopes
                'https://www.googleapis.com/auth/admin.directory.user.readonly',     // Read users
                'https://www.googleapis.com/auth/admin.directory.group.readonly',    // Read groups
                'https://www.googleapis.com/auth/admin.directory.domain.readonly',   // Read domains
                'https://www.googleapis.com/auth/admin.directory.orgunit.readonly',  // Read org units
                'https://www.googleapis.com/auth/admin.reports.audit.readonly',      // Read audit logs
                'https://www.googleapis.com/auth/admin.reports.usage.readonly',      // Read usage reports
                // Drive API scopes
                'https://www.googleapis.com/auth/drive.readonly',                    // Read Drive files
                // Gmail API scopes
                'https://www.googleapis.com/auth/gmail.readonly'                     // Read Gmail
            ];

            const oauth2Client = new google.auth.OAuth2(
                import.meta.env.GOOGLE_CLIENT_ID,
                import.meta.env.GOOGLE_CLIENT_SECRET,
                "http://localhost:4321/api/callback"
            );

            console.log("OAuth2 client created");

            const url = oauth2Client.generateAuthUrl({
                access_type: "offline",
                scope: scopes,
            });

            console.log("Generated auth URL:", url);

            return { url: url }
        }
    }),

    checkDrive: defineAction({
        handler: async (_, { cookies }) => {
            console.log("checkDrive handler called");
            const userCookie = cookies.get("user")?.value;
            const tokensCookie = cookies.get("tokens")?.value;

            console.log("userCookie:", userCookie);
            console.log("tokensCookie:", typeof tokensCookie);

            if (!userCookie || !tokensCookie) {
                console.log("Unauthorized: missing cookies");
                return { error: "Unauthorized" };
            }

            const oauth2Client = new google.auth.OAuth2(
                import.meta.env.GOOGLE_CLIENT_ID,
                import.meta.env.GOOGLE_CLIENT_SECRET,
                "http://localhost:4321/api/callback"
            );

            try {
                oauth2Client.setCredentials(JSON.parse(tokensCookie));
                console.log("OAuth2 credentials set");
            } catch (err) {
                console.error("Error parsing tokensCookie:", err);
                return { error: "Invalid token format" };
            }

            const drive = google.drive({ version: "v3", auth: oauth2Client });

            try {
                const { data: sharedDrives } = await drive.drives.list({
                    pageSize: 100,
                    fields: 'drives'
                });
                console.log("Drive files data:", sharedDrives);
                return { data: sharedDrives };
            } catch (err) {
                console.error("Error listing drive files:", err);
                return { error: "Failed to list drive files" };
            }
        }
    }),

    getUsers: defineAction({
        handler: async (_, { cookies }) => {
            console.log("getUsers handler called");
            const userCookie = cookies.get("user")?.value;
            const tokensCookie = cookies.get("tokens")?.value;

            if (!userCookie || !tokensCookie) {
                console.log("Unauthorized: missing cookies");
                return { error: "Unauthorized" };
            }

            const oauth2Client = new google.auth.OAuth2(
                import.meta.env.GOOGLE_CLIENT_ID,
                import.meta.env.GOOGLE_CLIENT_SECRET,
                "http://localhost:4321/api/callback"
            );
            console.log(tokensCookie)

            try {
                oauth2Client.setCredentials(JSON.parse(tokensCookie));
                console.log("OAuth2 credentials set for Admin SDK");
            } catch (err) {
                console.error("Error parsing tokensCookie:", err);
                return { error: "Invalid token format" };
            }

            const admin = google.admin({ version: 'directory_v1', auth: oauth2Client });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            try {
                const response = await admin.users.list({
                    customer: 'my_customer',
                    maxResults: 100,
                    orderBy: 'email'
                });

                const users = response.data.users || [];
                console.log(`Processing ${users.length} users for file and email counts`);

                // Fetch file and email counts for each user
                const usersWithCounts = await Promise.all(
                    users.map(async (user) => {
                        let fileCount = 0;
                        let emailCount = 0;

                        try {
                            // For accurate count, we need to get all files
                            let allFiles = [];
                            let nextPageToken = '';

                            do {
                                const pageResponse = await drive.files.list({
                                    q: `'${user.primaryEmail}' in owners and trashed=false`,
                                    pageSize: 1000,
                                    pageToken: nextPageToken || undefined,
                                    fields: 'files(id), nextPageToken'
                                });

                                allFiles.push(...(pageResponse.data.files || []));
                                nextPageToken = pageResponse.data.nextPageToken || '';
                            } while (nextPageToken);

                            fileCount = allFiles.length;

                        } catch (driveErr) {
                            console.warn(`Failed to get file count for ${user.primaryEmail}:`, driveErr instanceof Error ? driveErr.message : 'Unknown error');
                        }

                        try {
                            // Get email count from Gmail using the profile
                            const profile = await gmail.users.getProfile({
                                userId: user.primaryEmail || 'me'
                            });

                            emailCount = profile.data.messagesTotal || 0;

                        } catch (gmailErr) {
                            console.warn(`Failed to get email count for ${user.primaryEmail}:`, gmailErr instanceof Error ? gmailErr.message : 'Unknown error');
                        }

                        console.log(`${user.primaryEmail}: ${fileCount} files, ${emailCount} emails`);

                        return {
                            ...user,
                            fileCount,
                            emailCount
                        };
                    })
                );

                return {
                    users: usersWithCounts,
                    nextPageToken: response.data.nextPageToken
                };
            } catch (err) {
                console.error("Error listing users:", err);
                return { error: "Failed to list users" };
            }
        }
    })
}
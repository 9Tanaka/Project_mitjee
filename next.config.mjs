/** Keep database and native hashing dependencies on the server runtime. */
export default {
  serverExternalPackages: ["@prisma/client", "bcrypt", "@prisma/adapter-mariadb", "mariadb"],
  webpack(config) {
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

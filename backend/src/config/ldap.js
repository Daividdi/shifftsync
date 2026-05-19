const ldap = require("ldapjs");

const LDAP_CONFIG = {
  url:          process.env.LDAP_URL           || "ldap://localhost:389",
  bindDN:       process.env.LDAP_BIND_DN        || "cn=admin,dc=empresa,dc=com",
  bindPassword: process.env.LDAP_BIND_PASSWORD  || "",
  baseDN:       process.env.LDAP_BASE_DN        || "dc=empresa,dc=com",
  syncBaseDN:   process.env.LDAP_SYNC_BASE_DN   || process.env.LDAP_BASE_DN || "dc=empresa,dc=com",
  filter:       process.env.LDAP_FILTER         || "(&(objectClass=user)(objectCategory=person))",
  attrs: {
    username: process.env.LDAP_USERNAME_ATTR || "sAMAccountName",
    fullName: process.env.LDAP_FULLNAME_ATTR || "displayName",
    email:    process.env.LDAP_EMAIL_ATTR    || "mail",
    dept:     process.env.LDAP_DEPT_ATTR     || "department",
    title:    process.env.LDAP_TITLE_ATTR    || "title",
  },
};

async function ldapAuthenticate(username, password) {
  return new Promise((resolve, reject) => {
    const serviceClient = ldap.createClient({ url: LDAP_CONFIG.url });

    serviceClient.bind(LDAP_CONFIG.bindDN, LDAP_CONFIG.bindPassword, (err) => {
      if (err) {
        serviceClient.destroy();
        return reject(new Error("LDAP service bind failed: " + err.message));
      }

      const searchFilter = `(&(objectClass=user)(objectCategory=person)(${LDAP_CONFIG.attrs.username}=${ldapEscape(username)}))`;
      const attrList = [...Object.values(LDAP_CONFIG.attrs), "userPrincipalName"];

      serviceClient.search(LDAP_CONFIG.baseDN, {
        scope: "sub",
        filter: searchFilter,
        attributes: attrList,
      }, (searchErr, res) => {
        if (searchErr) {
          serviceClient.destroy();
          return reject(new Error("LDAP search failed: " + searchErr.message));
        }

        let userEntry = null;

        res.on("searchEntry", (entry) => {
          const attrs = parseAttributes(entry);
          // Usa UPN para o bind — evita problema com caracteres especiais no DN
          const upn = entry.attributes.find(
            (a) => a.type.toLowerCase() === "userprincipalname"
          )?.values[0];

          userEntry = {
            bindId: upn || entry.dn.toString(), // prefere UPN sobre DN
            attributes: attrs,
          };
        });

        res.on("error", (e) => {
          serviceClient.destroy();
          reject(new Error("LDAP search error: " + e.message));
        });

        res.on("end", () => {
          serviceClient.unbind();
          serviceClient.destroy();

          if (!userEntry) {
            return reject(new Error("Usuário não encontrado no LDAP"));
          }

          // Faz bind com UPN (user@domain.com) em vez do DN com caracteres especiais
          const userClient = ldap.createClient({ url: LDAP_CONFIG.url });
          userClient.bind(userEntry.bindId, password, (bindErr) => {
            userClient.destroy();
            if (bindErr) {
              return reject(new Error("Credenciais inválidas"));
            }
            resolve(userEntry.attributes);
          });
        });
      });
    });
  });
}

async function ldapListUsers() {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({ url: LDAP_CONFIG.url });

    client.bind(LDAP_CONFIG.bindDN, LDAP_CONFIG.bindPassword, (err) => {
      if (err) {
        client.destroy();
        return reject(new Error("LDAP bind failed: " + err.message));
      }

      const attrList = Object.values(LDAP_CONFIG.attrs);
      const users = [];

      client.search(LDAP_CONFIG.syncBaseDN, {
        scope: "sub",
        filter: LDAP_CONFIG.filter,
        attributes: attrList,
      }, (searchErr, res) => {
        if (searchErr) {
          client.destroy();
          return reject(searchErr);
        }

        res.on("searchEntry", (entry) => {
          users.push(parseAttributes(entry));
        });

        res.on("error", (e) => {
          client.destroy();
          reject(e);
        });

        res.on("end", () => {
          client.unbind();
          client.destroy();
          resolve(users);
        });
      });
    });
  });
}

function parseAttributes(entry) {
  const result = {};
  const attrs = LDAP_CONFIG.attrs;

  for (const [key, ldapAttr] of Object.entries(attrs)) {
    const attr = entry.attributes.find(
      (a) => a.type.toLowerCase() === ldapAttr.toLowerCase()
    );
    result[key] = attr ? attr.values[0] : null;
  }

  return result;
}

function ldapEscape(str) {
  return str.replace(/[\\*()[\]]/g, "\\$&");
}

module.exports = { ldapAuthenticate, ldapListUsers, LDAP_CONFIG };

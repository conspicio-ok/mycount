package auth

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// Bannissement par couple pseudo + IP, stocké dans la table BANNI en RAM : un redémarrage
// lève tous les bannissements. Vérifié avant le hash : un couple banni ne coûte aucun argon2.
//
// L'IP est celle du client, pas celle du proxy (Vite en dev, reverse proxy en prod) : sans
// ça, toutes les requêtes auraient la même IP et 5 échecs sur un pseudo bloqueraient son
// propriétaire partout.
const (
	banMaxFailures = 5
	banDuration    = 5 * time.Minute

	trustedHopsEnv     = "TRUSTED_PROXY_HOPS"
	defaultTrustedHops = 1
)

// Nombre de proxys de confiance devant l'API, chacun ajoutant une entrée à X-Forwarded-For.
var trustedHops = defaultTrustedHops

func loadTrustedHops() error {
	value := os.Getenv(trustedHopsEnv)
	if value == "" {
		return nil
	}
	hops, err := strconv.Atoi(value)
	if err != nil || hops < 0 {
		return fmt.Errorf("%s invalide : %q", trustedHopsEnv, value)
	}
	trustedHops = hops
	return nil
}

// clientIP lit l'IP du client dans X-Forwarded-For. Chaque proxy ajoute à droite l'adresse
// qu'il voit : l'entrée posée par le premier proxy de confiance est la trustedHops-ième en
// partant de la fin. Les entrées plus à gauche viennent du client et peuvent être forgées,
// elles sont ignorées. L'API ne doit donc être joignable qu'à travers ces proxys.
func clientIP(r *http.Request) string {
	remote, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remote = r.RemoteAddr
	}
	if trustedHops == 0 {
		return remote
	}

	var entries []string
	for _, header := range r.Header.Values("X-Forwarded-For") {
		for _, entry := range strings.Split(header, ",") {
			entries = append(entries, strings.TrimSpace(entry))
		}
	}
	if len(entries) < trustedHops {
		return remote
	}
	if ip := net.ParseIP(entries[len(entries)-trustedHops]); ip != nil {
		return ip.String()
	}
	return remote
}

// Package auth 提供 JWT (HS256) 与密码哈希封装，零外部依赖。
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Claims JWT 载荷
type Claims struct {
	Sub      string `json:"sub"`      // user id
	Username string `json:"username"`
	Role     string `json:"role"`
	Exp      int64  `json:"exp"`
	Iat      int64  `json:"iat"`
}

// HashPassword bcrypt 哈希
func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// CheckPassword 校验密码
func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// SignToken 生成 HS256 token，有效期默认 7 天
func SignToken(secret string, c Claims, ttl time.Duration) (string, error) {
	if c.Iat == 0 {
		c.Iat = time.Now().Unix()
	}
	if c.Exp == 0 {
		c.Exp = time.Now().Add(ttl).Unix()
	}
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	hb, _ := json.Marshal(header)
	pb, _ := json.Marshal(c)
	headerSeg := b64(hb)
	payloadSeg := b64(pb)
	signing := headerSeg + "." + payloadSeg
	sig := hs256(secret, signing)
	return signing + "." + sig, nil
}

// VerifyToken 解析并校验签名 / 过期
func VerifyToken(secret, tokenStr string) (*Claims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token format")
	}
	signing := parts[0] + "." + parts[1]
	expected := hs256(secret, signing)
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return nil, errors.New("signature mismatch")
	}
	pb, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var c Claims
	if err := json.Unmarshal(pb, &c); err != nil {
		return nil, err
	}
	if c.Exp > 0 && time.Now().Unix() > c.Exp {
		return nil, errors.New("token expired")
	}
	return &c, nil
}

func hs256(secret, msg string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

/* Ubicacion: /routes/versus.js — Batalla diaria entre dos juegos */
const express = require("express");
const router = express.Router();
const { db, admin } = require("../services/firebase");
const { getTrendingGames } = require("../services/igdbClient");
const { isAuthenticatedApi, getUid } = require("../middleware/auth");

const getTodayStr = () => new Date().toISOString().split('T')[0];

// Mostrar la batalla del dia (o una fecha pasada si se pasa por URL para el historial)
router.get("/:date?", async (req, res) => {
    try {
        // Si viene fecha en URL, usamos esa (para el historial). Si no, HOY.
        const dateParam = req.params.date || getTodayStr();
        const isToday = dateParam === getTodayStr();

        const docRef = db.collection('daily_versus').doc(dateParam);
        const docSnap = await docRef.get();

        let battleData;

        if (docSnap.exists) {
            battleData = docSnap.data();
        } else {
            // No existe y es hoy → crear batalla nueva con juegos trending de IGDB
            if (isToday) {
                const gamesPool = await getTrendingGames(60);

                // Protección por si la API falla y no devuelve juegos
                if (!gamesPool || gamesPool.length < 2) {
                    throw new Error("Not enough games from API to create versus");
                }

                const index1 = Math.floor(Math.random() * gamesPool.length);
                let index2 = Math.floor(Math.random() * gamesPool.length);
                while (index1 === index2) index2 = Math.floor(Math.random() * gamesPool.length);

                const g1 = gamesPool[index1];
                const g2 = gamesPool[index2];

                // --- CORRECCIÓN AQUÍ: Evitar 'undefined' ---
                battleData = {
                    date: dateParam,
                    game1: {
                        id: g1.id,
                        name: g1.name,
                        coverUrl: g1.coverUrl || "", // Si no hay cover, string vacío
                        votes: 0,
                        year: g1.year || "N/A",      // <--- AQUÍ FALLABA ANTES
                        rating: g1.rating || 0       // Si no hay rating, poner 0
                    },
                    game2: {
                        id: g2.id,
                        name: g2.name,
                        coverUrl: g2.coverUrl || "",
                        votes: 0,
                        year: g2.year || "N/A",      // <--- PROTECCIÓN
                        rating: g2.rating || 0
                    },
                    totalVotes: 0
                };

                await docRef.set(battleData);
            } else {
                // Si piden una fecha futura o inexistente pasada
                return res.redirect('/versus');
            }
        }

        // Porcentajes para las barras de progreso en la vista
        const total = battleData.totalVotes || 0;
        const p1 = total === 0 ? 50 : Math.round((battleData.game1.votes / total) * 100);
        const p2 = total === 0 ? 50 : 100 - p1;

        // Verificar si el usuario ya voto hoy (solo si esta logueado)
        let userVoted = false;
        if (req.user) {
            const uid = getUid(req);
            const voterDoc = await db.collection('daily_versus').doc(dateParam).collection('voters').doc(uid).get();
            userVoted = voterDoc.exists;
        }

        res.render("layout", {
            title: isToday ? "Daily Battle | GameLift" : `Battle of ${dateParam}`,
            page: "versus",
            active: "versus",
            data: { ...battleData, p1, p2, isToday, total, userVoted },
            user: req.user
        });

    } catch (error) {
        console.error("Error loading versus:", error.message);
        // Si falla, redirigimos a home para no romper la experiencia
        res.redirect("/");
    }
});

// Registrar un voto — requiere login + tracking en Firestore para evitar duplicados
router.post("/vote", isAuthenticatedApi, async (req, res) => {
    const { date, winnerSide } = req.body;
    const uid = getUid(req);

    if (!date || !uid) return res.status(400).json({ success: false });

    try {
        const docRef = db.collection('daily_versus').doc(date);
        const voterRef = docRef.collection('voters').doc(uid);

        // Transaccion: verificar voto previo + sumar en un solo paso atómico
        await db.runTransaction(async (t) => {
            const [doc, voterDoc] = await Promise.all([t.get(docRef), t.get(voterRef)]);

            if (!doc.exists) throw "Document does not exist!";
            if (voterDoc.exists) throw "already_voted";

            const data = doc.data();
            const newTotal = (data.totalVotes || 0) + 1;

            if (winnerSide === 'left') {
                const newVotes = (data.game1.votes || 0) + 1;
                t.update(docRef, { 'game1.votes': newVotes, totalVotes: newTotal });
            } else {
                const newVotes = (data.game2.votes || 0) + 1;
                t.update(docRef, { 'game2.votes': newVotes, totalVotes: newTotal });
            }

            // Registrar quién votó y por quién
            t.set(voterRef, { side: winnerSide, votedAt: admin.firestore.FieldValue.serverTimestamp() });
        });

        res.json({ success: true });
    } catch (error) {
        if (error === "already_voted") {
            return res.status(409).json({ success: false, error: "already_voted" });
        }
        console.error("Vote error:", error);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
const express = require("express");
const router = express.Router();
const { igdbQuery } = require("../services/igdbClient");

// Perfil de una compania/estudio — trae info + juegos desarrollados directo de IGDB
router.get('/:id', async (req, res) => {
  try {
    const companyId = req.params.id;

    // Dos consultas a IGDB en paralelo para que cargue mas rapido
    const [companyData, gamesData] = await Promise.all([
      igdbQuery('companies', `fields name, description, logo.image_id; where id = ${companyId};`),
      igdbQuery('games', `
        fields name, cover.image_id, first_release_date, artworks.image_id, total_rating;
        where involved_companies.company = ${companyId}
        & (category = 0 | category = 8 | category = 9)
        & cover != null;
        sort total_rating desc;
        limit 40;
      `)
    ]);

    if (!companyData || companyData.length === 0) return res.redirect('/');

    const company = companyData[0];

    // Buscar un artwork de alguno de sus juegos para usarlo de fondo hero
    let heroBackgroundUrl = '/images/default-hero-bg.jpg';
    if (Array.isArray(gamesData) && gamesData.length > 0) {
      const gArt = gamesData.find(g => g.artworks && g.artworks.length > 0);
      if (gArt) heroBackgroundUrl = `https://images.igdb.com/igdb/image/upload/t_1080p/${gArt.artworks[0].image_id}.jpg`;
    }

    // Formatear cada juego para la vista — cover, rating redondeado y ano de lanzamiento
    const developedGames = Array.isArray(gamesData) ? gamesData.map(g => ({
      id: g.id,
      name: g.name,
      coverUrl: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : '/images/no-cover.png',
      rating: g.total_rating ? Math.round(g.total_rating) : null,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 'N/A'
    })) : [];

    res.render('layout', {
      title: `${company.name} | GameLift`,
      page: 'company-profile',
      user: req.user || null,
      data: {
        id: company.id,
        name: company.name,
        description: company.description || `One of the world's leading game developers.`,
        logoUrl: company.logo ? `https://images.igdb.com/igdb/image/upload/t_logo_med/${company.logo.image_id}.png` : '/images/no-company-logo.png',
        heroBackgroundUrl,
        developed: developedGames
      }
    });

  } catch (error) {
    console.error("Error in Company Profile:", error);
    res.redirect('/');
  }
});

module.exports = router;

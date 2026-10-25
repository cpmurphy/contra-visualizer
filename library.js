// The dances built into the application, and the URL slugs that name them

import dances from './library/dances.json' with { type: 'json' };

export { dances };

/**
 * Make the URL slug for a dance from its title, e.g. "Lady of the Lake" -> "lady-of-the-lake"
 * @param {Object} dance
 * @returns {string}
 */
export function danceSlug(dance) {
    return dance.title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // drop accents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Find a built-in dance by its slug
 * @param {string} slug
 * @returns {Object|undefined}
 */
export function findDance(slug) {
    return dances.find(dance => danceSlug(dance) === slug);
}

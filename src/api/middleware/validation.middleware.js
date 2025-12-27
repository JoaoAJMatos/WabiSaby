/**
 * Validation Middleware
 * Provides request validation helpers
 */

/**
 * Validate that required parameters are present
 * @param {string[]} requiredParams - Array of required parameter names
 * @returns {Function} Express middleware function
 */
function validateRequired(requiredParams) {
    return (req, res, next) => {
        const missing = [];

        for (const param of requiredParams) {
            if (req.body && req.body[param] !== undefined) continue;
            if (req.query && req.query[param] !== undefined) continue;
            if (req.params && req.params[param] !== undefined) continue;

            missing.push(param);
        }

        if (missing.length > 0) {
            return res.status(400).json({
                error: 'Missing required parameters',
                missing: missing
            });
        }

        next();
    };
}

/**
 * Validate request body structure
 * @param {Function} validator - Validation function that returns error message or null
 * @returns {Function} Express middleware function
 */
function validateBody(validator) {
    return (req, res, next) => {
        if (!req.body) {
            return res.status(400).json({ error: 'Request body required' });
        }

        const error = validator(req.body);
        if (error) {
            return res.status(400).json({ error: error });
        }

        next();
    };
}

/**
 * Validate numeric parameters
 * @param {string[]} numericParams - Array of parameter names that should be numeric
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware function
 */
function validateNumeric(numericParams, options = {}) {
    const { min, max, integer = false } = options;

    return (req, res, next) => {
        const errors = [];

        for (const param of numericParams) {
            let value = req.body?.[param] || req.query?.[param] || req.params?.[param];

            if (value !== undefined) {
                const numValue = integer ? parseInt(value, 10) : parseFloat(value);

                if (isNaN(numValue)) {
                    errors.push(`${param} must be a ${integer ? 'integer' : 'number'}`);
                    continue;
                }

                if (min !== undefined && numValue < min) {
                    errors.push(`${param} must be at least ${min}`);
                }

                if (max !== undefined && numValue > max) {
                    errors.push(`${param} must be at most ${max}`);
                }

                // Store parsed value back
                if (req.body && req.body[param] !== undefined) {
                    req.body[param] = numValue;
                } else if (req.query && req.query[param] !== undefined) {
                    req.query[param] = numValue;
                } else if (req.params && req.params[param] !== undefined) {
                    req.params[param] = numValue;
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    };
}

/**
 * Validate string parameters
 * @param {string[]} stringParams - Array of parameter names that should be strings
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware function
 */
function validateString(stringParams, options = {}) {
    const { minLength, maxLength, pattern } = options;

    return (req, res, next) => {
        const errors = [];

        for (const param of stringParams) {
            let value = req.body?.[param] || req.query?.[param] || req.params?.[param];

            if (value !== undefined) {
                if (typeof value !== 'string') {
                    errors.push(`${param} must be a string`);
                    continue;
                }

                if (minLength !== undefined && value.length < minLength) {
                    errors.push(`${param} must be at least ${minLength} characters`);
                }

                if (maxLength !== undefined && value.length > maxLength) {
                    errors.push(`${param} must be at most ${maxLength} characters`);
                }

                if (pattern && !pattern.test(value)) {
                    errors.push(`${param} format is invalid`);
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    };
}

/**
 * General request validation wrapper
 * @param {Object} rules - Validation rules
 * @returns {Function} Express middleware function
 */
function validateRequest(rules) {
    const middlewares = [];

    if (rules.required) {
        middlewares.push(validateRequired(rules.required));
    }

    if (rules.numeric) {
        middlewares.push(validateNumeric(rules.numeric, rules.numericOptions));
    }

    if (rules.string) {
        middlewares.push(validateString(rules.string, rules.stringOptions));
    }

    if (rules.custom) {
        middlewares.push(validateBody(rules.custom));
    }

    return (req, res, next) => {
        let index = 0;

        const runNext = () => {
            if (index < middlewares.length) {
                middlewares[index++](req, res, runNext);
            } else {
                next();
            }
        };

        runNext();
    };
}

module.exports = {
    validateRequired,
    validateBody,
    validateNumeric,
    validateString,
    validateRequest
};

-- ============================================================================
-- Seed: 5 new categories with 10 questions each
-- Run: PGPASSWORD=localdb psql -h localhost -U postgres -d nakama -f this_file.sql
-- ============================================================================

BEGIN;

-- 1. GEOGRAPHY
INSERT INTO categories (category_key, name, icon, description, category_type, questions_per_match, time_per_question, is_active, display_order)
VALUES ('geography', 'Geography', 'globe', 'Test your knowledge of world geography — countries, capitals, landmarks, and more.', 'normal', 10, 15, true, 20)
ON CONFLICT (category_key) DO UPDATE SET is_active = true, display_order = 20;

INSERT INTO questions (category, difficulty, question_text, options, correct_index, explanation, question_type, is_active) VALUES
('geography', 'easy', 'What is the largest continent by land area?',
 '["Africa", "North America", "Asia", "Europe"]', 2,
 'Asia covers about 44.6 million km², roughly 30% of Earth''s total land area.', 'mcq', true),
('geography', 'easy', 'Which country has the longest coastline in the world?',
 '["Australia", "Russia", "Indonesia", "Canada"]', 3,
 'Canada has over 202,000 km of coastline, the longest of any country.', 'mcq', true),
('geography', 'easy', 'What is the capital city of Australia?',
 '["Sydney", "Melbourne", "Canberra", "Brisbane"]', 2,
 'Canberra was chosen as a compromise between Sydney and Melbourne.', 'mcq', true),
('geography', 'medium', 'Which river is the longest in the world?',
 '["Amazon", "Nile", "Yangtze", "Mississippi"]', 1,
 'The Nile stretches approximately 6,650 km through northeastern Africa.', 'mcq', true),
('geography', 'medium', 'What is the smallest country in the world by area?',
 '["Monaco", "San Marino", "Vatican City", "Liechtenstein"]', 2,
 'Vatican City is just 0.49 km², an independent city-state within Rome.', 'mcq', true),
('geography', 'medium', 'How many continents are there on Earth?',
 '["5", "6", "7", "8"]', 2,
 'The seven continents are: Africa, Antarctica, Asia, Australia/Oceania, Europe, North America, and South America.', 'mcq', true),
('geography', 'medium', 'Which desert is the largest hot desert in the world?',
 '["Gobi", "Kalahari", "Sahara", "Arabian"]', 2,
 'The Sahara covers about 9.2 million km² across North Africa.', 'mcq', true),
('geography', 'hard', 'What is the deepest point in the Earth''s oceans?',
 '["Tonga Trench", "Mariana Trench", "Java Trench", "Puerto Rico Trench"]', 1,
 'Challenger Deep in the Mariana Trench reaches about 11,000 meters.', 'mcq', true),
('geography', 'hard', 'Which country has the highest number of time zones?',
 '["Russia", "United States", "France", "United Kingdom"]', 2,
 'France has 12 time zones due to its overseas territories around the world.', 'mcq', true),
('geography', 'hard', 'What strait separates Europe from Asia?',
 '["Bosporus", "Strait of Gibraltar", "Strait of Malacca", "Bering Strait"]', 0,
 'The Bosporus Strait in Turkey separates European Turkey from Asian Turkey.', 'mcq', true);

-- 2. LITERATURE
INSERT INTO categories (category_key, name, icon, description, category_type, questions_per_match, time_per_question, is_active, display_order)
VALUES ('literature', 'Literature', 'book', 'Classic and modern literature — authors, books, characters, and literary terms.', 'normal', 10, 15, true, 21)
ON CONFLICT (category_key) DO UPDATE SET is_active = true, display_order = 21;

INSERT INTO questions (category, difficulty, question_text, options, correct_index, explanation, question_type, is_active) VALUES
('literature', 'easy', 'Who wrote "Romeo and Juliet"?',
 '["Charles Dickens", "Jane Austen", "William Shakespeare", "Mark Twain"]', 2,
 'Shakespeare wrote this tragic love story around 1595.', 'mcq', true),
('literature', 'easy', 'What is the first book of the Harry Potter series?',
 '["Chamber of Secrets", "Prisoner of Azkaban", "Philosopher''s Stone", "Goblet of Fire"]', 2,
 'Harry Potter and the Philosopher''s Stone was published in 1997.', 'mcq', true),
('literature', 'easy', 'Which novel begins with "Call me Ishmael"?',
 '["The Old Man and the Sea", "Moby-Dick", "Treasure Island", "20,000 Leagues Under the Sea"]', 1,
 'Herman Melville''s Moby-Dick opens with this famous line.', 'mcq', true),
('literature', 'medium', 'Who wrote "1984" and "Animal Farm"?',
 '["Aldous Huxley", "Ray Bradbury", "George Orwell", "H.G. Wells"]', 2,
 'George Orwell (Eric Blair) wrote both dystopian classics.', 'mcq', true),
('literature', 'medium', 'Which Russian author wrote "War and Peace"?',
 '["Fyodor Dostoevsky", "Leo Tolstoy", "Anton Chekhov", "Ivan Turgenev"]', 1,
 'Tolstoy''s epic novel was published in 1869 and spans 1,200+ pages.', 'mcq', true),
('literature', 'medium', 'What is the literary term for a story within a story?',
 '["Metaphor", "Allegory", "Frame narrative", "Soliloquy"]', 2,
 'A frame narrative embeds one story inside another, like in "The Canterbury Tales".', 'mcq', true),
('literature', 'medium', 'Who is the author of "To Kill a Mockingbird"?',
 '["Harper Lee", "Truman Capote", "John Steinbeck", "Toni Morrison"]', 0,
 'Harper Lee''s Pulitzer Prize-winning novel was published in 1960.', 'mcq', true),
('literature', 'hard', 'Which Shakespeare play contains the line "To thine own self be true"?',
 '["Macbeth", "Othello", "Hamlet", "King Lear"]', 2,
 'Polonius gives this advice to his son Laertes in Hamlet, Act I, Scene III.', 'mcq', true),
('literature', 'hard', 'In which century did Geoffrey Chaucer write "The Canterbury Tales"?',
 '["12th century", "13th century", "14th century", "15th century"]', 2,
 'Chaucer wrote the tales in Middle English between 1387 and 1400.', 'mcq', true),
('literature', 'hard', 'Who wrote the epic poem "Paradise Lost"?',
 '["John Donne", "John Milton", "Edmund Spenser", "William Blake"]', 1,
 'Milton''s blank verse epic about the Fall of Man was published in 1667.', 'mcq', true);

-- 3. MUSIC
INSERT INTO categories (category_key, name, icon, description, category_type, questions_per_match, time_per_question, is_active, display_order)
VALUES ('music', 'Music', 'music', 'From classical symphonies to modern hits — test your musical knowledge.', 'normal', 10, 15, true, 22)
ON CONFLICT (category_key) DO UPDATE SET is_active = true, display_order = 22;

INSERT INTO questions (category, difficulty, question_text, options, correct_index, explanation, question_type, is_active) VALUES
('music', 'easy', 'How many strings does a standard violin have?',
 '["3", "4", "5", "6"]', 1,
 'A standard violin has four strings tuned G-D-A-E.', 'mcq', true),
('music', 'easy', 'Which band is known as the "Fab Four"?',
 '["The Rolling Stones", "The Who", "The Beatles", "Queen"]', 2,
 'The Beatles — John, Paul, George, and Ringo — were nicknamed the Fab Four.', 'mcq', true),
('music', 'easy', 'What is the highest female singing voice?',
 '["Alto", "Mezzo-soprano", "Soprano", "Contralto"]', 2,
 'Soprano is the highest standard female voice type, typically ranging from C4 to C6.', 'mcq', true),
('music', 'medium', 'Which composer wrote the "Moonlight Sonata"?',
 '["Mozart", "Bach", "Beethoven", "Chopin"]', 2,
 'Beethoven''s Piano Sonata No. 14 is popularly known as the Moonlight Sonata.', 'mcq', true),
('music', 'medium', 'What genre of music originated in New Orleans in the early 1900s?',
 '["Blues", "Rock and Roll", "Jazz", "Country"]', 2,
 'Jazz emerged from African American communities in New Orleans around the 1910s.', 'mcq', true),
('music', 'medium', 'How many notes are in a standard octave (Western music)?',
 '["7", "8", "12", "13"]', 2,
 'A chromatic octave has 12 semitones. A diatonic scale uses 7 of those notes.', 'mcq', true),
('music', 'medium', 'Which instrument has 88 keys?',
 '["Organ", "Accordion", "Standard piano", "Harpsichord"]', 2,
 'A standard full-size piano has 88 keys: 52 white and 36 black.', 'mcq', true),
('music', 'hard', 'What is the time signature of a waltz?',
 '["2/4", "3/4", "4/4", "6/8"]', 1,
 'A waltz is in 3/4 time with a strong first beat: ONE-two-three.', 'mcq', true),
('music', 'hard', 'Which band released the album "The Dark Side of the Moon"?',
 '["Led Zeppelin", "Pink Floyd", "The Doors", "Genesis"]', 1,
 'Pink Floyd''s iconic 1973 album stayed on Billboard charts for over 900 weeks.', 'mcq', true),
('music', 'hard', 'What is the lowest brass instrument in a typical orchestra?',
 '["Trombone", "French horn", "Tuba", "Euphonium"]', 2,
 'The tuba is the largest and lowest-pitched brass instrument in the orchestra.', 'mcq', true);

-- 4. TECHNOLOGY
INSERT INTO categories (category_key, name, icon, description, category_type, questions_per_match, time_per_question, is_active, display_order)
VALUES ('technology', 'Technology', 'cpu', 'Computers, internet, gadgets, and innovations that shape our world.', 'normal', 10, 15, true, 23)
ON CONFLICT (category_key) DO UPDATE SET is_active = true, display_order = 23;

INSERT INTO questions (category, difficulty, question_text, options, correct_index, explanation, question_type, is_active) VALUES
('technology', 'easy', 'What does CPU stand for?',
 '["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Core Processing Unit"]', 0,
 'The CPU is the primary component that executes instructions in a computer.', 'mcq', true),
('technology', 'easy', 'What year was the iPhone first released?',
 '["2005", "2006", "2007", "2008"]', 2,
 'Steve Jobs unveiled the first iPhone on January 9, 2007.', 'mcq', true),
('technology', 'easy', 'What does "HTML" stand for?',
 '["HyperText Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlink Text Markup Logic"]', 0,
 'HTML is the standard markup language for creating web pages.', 'mcq', true),
('technology', 'medium', 'Who is considered the father of the World Wide Web?',
 '["Bill Gates", "Steve Jobs", "Tim Berners-Lee", "Vint Cerf"]', 2,
 'Tim Berners-Lee invented the World Wide Web in 1989 at CERN.', 'mcq', true),
('technology', 'medium', 'What programming language was created by Google in 2009?',
 '["Rust", "Swift", "Kotlin", "Go (Golang)"]', 3,
 'Go was designed at Google by Robert Griesemer, Rob Pike, and Ken Thompson.', 'mcq', true),
('technology', 'medium', 'What does SSD stand for in computing?',
 '["Super Speed Drive", "Solid State Drive", "System Storage Device", "Sequential Storage Disk"]', 1,
 'SSDs use flash memory to store data persistently without moving parts.', 'mcq', true),
('technology', 'medium', 'Which company developed the Android operating system?',
 '["Apple", "Microsoft", "Google", "Samsung"]', 2,
 'Android was originally developed by Android Inc., which Google acquired in 2005.', 'mcq', true),
('technology', 'hard', 'In binary, what decimal value does 1010 represent?',
 '["8", "9", "10", "12"]', 2,
 '1010 in binary = (1×8) + (0×4) + (1×2) + (0×1) = 10 in decimal.', 'mcq', true),
('technology', 'hard', 'What does the "T" in HTTPS stand for?',
 '["Transfer", "Transport", "Tunnel", "Type"]', 1,
 'HTTPS = HyperText Transfer Protocol Secure. TLS (Transport Layer Security) encrypts the connection.', 'mcq', true),
('technology', 'hard', 'Which company introduced the first microprocessor, the Intel 4004?',
 '["AMD", "IBM", "Intel", "Motorola"]', 2,
 'The Intel 4004, released in 1971, was the first commercially available microprocessor.', 'mcq', true);

-- 5. FOOD & CUISINE
INSERT INTO categories (category_key, name, icon, description, category_type, questions_per_match, time_per_question, is_active, display_order)
VALUES ('food_cuisine', 'Food & Cuisine', 'utensils', 'Explore world cuisines, ingredients, cooking techniques, and food history.', 'normal', 10, 15, true, 24)
ON CONFLICT (category_key) DO UPDATE SET is_active = true, display_order = 24;

INSERT INTO questions (category, difficulty, question_text, options, correct_index, explanation, question_type, is_active) VALUES
('food_cuisine', 'easy', 'What is the main ingredient in hummus?',
 '["Lentils", "Chickpeas", "Black beans", "Peas"]', 1,
 'Hummus is a Middle Eastern dip made from cooked, mashed chickpeas blended with tahini, lemon, and garlic.', 'mcq', true),
('food_cuisine', 'easy', 'Which country is the origin of sushi?',
 '["China", "Korea", "Japan", "Thailand"]', 2,
 'Sushi originated in Japan, originally as a way of preserving fish in fermented rice.', 'mcq', true),
('food_cuisine', 'easy', 'What vegetable is used to make pickles?',
 '["Zucchini", "Cucumber", "Celery", "Radish"]', 1,
 'Pickles are typically made by fermenting cucumbers in brine or vinegar.', 'mcq', true),
('food_cuisine', 'medium', 'Which spice gives curry its yellow color?',
 '["Paprika", "Turmeric", "Saffron", "Cumin"]', 1,
 'Turmeric contains curcumin, a bright yellow compound used in many curry dishes.', 'mcq', true),
('food_cuisine', 'medium', 'What type of pasta is shaped like small tubes?',
 '["Spaghetti", "Fettuccine", "Penne", "Linguine"]', 2,
 'Penne are short, tube-shaped pasta cut diagonally at both ends.', 'mcq', true),
('food_cuisine', 'medium', 'Which country produces the most coffee in the world?',
 '["Colombia", "Ethiopia", "Brazil", "Vietnam"]', 2,
 'Brazil has been the world''s largest coffee producer for over 150 years.', 'mcq', true),
('food_cuisine', 'medium', 'What is the French term for "everything in its place" in cooking?',
 '["À la carte", "Mise en place", "Sous vide", "Haute cuisine"]', 1,
 'Mise en place means preparing and organizing all ingredients before cooking begins.', 'mcq', true),
('food_cuisine', 'hard', 'Which of these is NOT one of the five mother sauces in French cuisine?',
 '["Béchamel", "Velouté", "Espagnole", "Marinara"]', 3,
 'The five mother sauces are Béchamel, Velouté, Espagnole, Hollandaise, and Tomate (not Marinara).', 'mcq', true),
('food_cuisine', 'hard', 'What is the active component in chili peppers that makes them hot?',
 '["Capsaicin", "Piperine", "Allicin", "Curcumin"]', 0,
 'Capsaicin binds to pain receptors in the mouth, creating the sensation of heat.', 'mcq', true),
('food_cuisine', 'hard', 'Which country is the origin of the dish "Biryani"?',
 '["Pakistan", "Bangladesh", "India", "Iran"]', 2,
 'Biryani originated in the Indian subcontinent, influenced by Persian pilaf brought by Mughal rulers.', 'mcq', true);

COMMIT;

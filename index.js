const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

// import express from "express";
// import { createRemoteJWKSet, jwtVerify } from "jose-cjs";

const express = require('express');
const app = express()
const port = process.env.PORT || 5000

// Extras
const cors = require('cors')
const dotenv = require('dotenv')
dotenv.config()
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
    res.json('RecipeMaster server is running smoothly')
})


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// import { MongoClient, ObjectId, ServerApiVersion, } from "mongodb";
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


// Token JWKS
// const JWKS = createRemoteJWKSet(
//     new URL(`${process.env.NEXT_PUBLIC_CLIENT_URL}/api/auth/jwks`)
// );

async function run() {
    try {
        // await client.connect();

        const database = client.db("RecipeMaster-DB");
        const recipesCollection = database.collection("recipes")
        const reviewCollection = database.collection("reviews")


        // Add Recipe --> POST to database
        app.post("/api/recipe/add-new", async (req, res) => {
            try {
                const data = req.body;
                const newData = {
                    ...data,
                    createdAt: new Date()
                };

                const result = await recipesCollection.insertOne(newData);
                res.json(result)

            } catch (error) {
                console.error("Error posting recipe", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to publish recipe | Internal error 500",
                    error
                })
            }
        })

        // Recipes --> Get all recipes with search & pagination
        app.get("/api/all-recipes", async (req, res) => {
            try {
                // Pagination
                const page = Number(req.query.page) || 1;
                const limit = Number(req.query.limit) || 8;
                const skip = (page - 1) * limit;
                // console.log("Page:", page)

                // Search filters
                const search = req.query.search;
                const category = req.query.category;
                const sort = req.query.sort;

                const query = {};

                if (search) {
                    query.title = {
                        $regex: search,
                        $options: "i",
                    };
                }

                if (category && category !== "All") {
                    query.category = category;
                }

                // Sorting
                let sortOption = {};

                if (sort === "newest") {
                    sortOption = { createdAt: -1 };
                }

                if (sort === "oldest") {
                    sortOption = { createdAt: 1 };
                }

                if (sort === "rating") {
                    sortOption = { rating: -1 };
                }

                if (sort === "cookingTime") {
                    sortOption = { cookingTime: 1 };
                }

                // Total Recipes Count
                const totalRecipes = await recipesCollection.countDocuments(query);

                // Final result
                const recipes = await recipesCollection
                    .find(query)
                    .sort(sortOption)
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                res.send({
                    success: true,
                    currentPage: page,
                    totalRecipes,
                    totalPages: Math.ceil(totalRecipes / limit),
                    totalItems: totalRecipes,
                    data: recipes,
                });

            } catch (error) {
                console.error(error);
                res.status(500).send({
                    success: false,
                    message: "Failed to fetch recipes",
                    error
                });
            }
        });

        // Recipe Details --> Get single data details
        app.get("/api/details/single-recipe/:id", async (req, res) => {
            try {
                const { userId } = req.query;
                const { id: recipeId } = req.params;
                const query = {
                    _id: new ObjectId(recipeId)
                }

                const recipeDetails = await recipesCollection.findOne(query)

                // User already reviewed or not
                const reviewQuery = {
                    recipeId,
                    "userInfo.userId": userId
                }

                let isReviewed = false;
                const isReviewExist = await reviewCollection.findOne(reviewQuery)
                if (isReviewExist) {
                    isReviewed = true
                }


                res.json({ ...recipeDetails, isReviewed })

            } catch (error) {
                console.error("Error getting recipe details!", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to get recipe details | Internal error 500",
                    error
                })
            }
        })

        // Recipe Details --> Recipe review
        app.post("/api/details/recipe-review", async (req, res) => {
            try {
                const data = req.body;
                const reviewData = {
                    ...data,
                    createdAt: new Date()
                }

                const recipeId = reviewData.recipeId;
                const userId = reviewData.userInfo.userId;
                const query = {
                    recipeId,
                    "userInfo.userId": userId
                }

                // Per user can review one time
                const isExist = await reviewCollection.findOne(query)
                // console.log("isExist : ", isExist)
                if (isExist) {
                    res.json({ isExist: true, message: "User already submitted review" })
                } else {
                    const submitReview = await reviewCollection.insertOne(reviewData)
                }

                // Need to update rating info
                const filter = { _id: new ObjectId(recipeId) }
                const recipe = await recipesCollection.findOne(filter)

                const rating = reviewData?.rating;
                const ratingSum = recipe?.ratingSum;
                const reviewCount = recipe?.reviewCount;

                // Calculation rating
                const newRatingSum = ratingSum + rating;
                const newReviewCount = reviewCount + 1;
                const avgRating = Number((newRatingSum / newReviewCount).toFixed(1));

                // Now update the rating values in the recipe data
                const updatedRating = await recipesCollection.updateOne(filter, {
                    $set: {
                        rating: avgRating,
                        ratingSum: newRatingSum,
                        reviewCount: newReviewCount
                    }
                })

                res.json({ isExist: false, message: "Review submitted." })

            } catch (error) {
                console.error("Error getting recipe details!", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to get recipe details | Internal error 500",
                    error
                })
            }
        })

        // Recipe Details --> Recent Reviews of all users
        app.get("/api/details/reviews", async (req, res) => {
            try {
                const { recipeId } = req.query;
                const result = await reviewCollection.find({ recipeId }).toArray();
                res.json(result)

            } catch (error) {
                console.error("Error getting recipe details!", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to get recipe details | Internal error 500",
                    error
                })
            }
        })

        // Manage Recipes --> Get my posted recipes
        app.get("/api/recipes/my-recipes", async (req, res) => {
            try {
                const { userId } = req.query;
                const query = {
                    "author.userId": userId
                }

                const myRecipes = await recipesCollection.find(query).toArray()
                res.json(myRecipes)

            } catch (error) {
                console.error("Error getting recipes!", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to get recipes | Internal error 500",
                    error
                })
            }
        })

        // Manage --> Delete
        app.delete("/api/recipes/manage/delete-recipe", async (req, res) => {
            try {
                const { recipeId } = req.query;
                const filter = {
                    _id: new ObjectId(recipeId)
                }

                const result = await recipesCollection.deleteOne(filter);
                res.json(result)

            } catch (error) {
                console.error("Error deleting recipe!", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to delete recipe | Internal error 500",
                    error
                })
            }
        })

        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);




app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
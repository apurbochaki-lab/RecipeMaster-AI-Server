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